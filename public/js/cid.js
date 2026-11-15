// Conversa com o Cid: texto ou áudio, resposta lida em voz alta.
// Com a IA ligada no servidor (Groq), o áudio é transcrito e respondido pela IA.
// Sem IA, o microfone usa o reconhecimento do navegador (Chrome) e as
// respostas vêm de regras sobre os mesmos dados da roça.

import { ICONES, armazenar, horaAgora, saudacao, nomeDoDia, hojeISO } from './util.js';
import { falar, pararFala, podeGravar, gravarAudio, podeReconhecer, reconhecerFala } from './voz.js';

const CHAVE = 'semeia:conversa';
const SUGESTOES = ['O que planto depois do milho?', 'Quando vem a chuva?', 'Dá pra plantar o feijão essa semana?', 'Como está o solo?'];
const ONDA = [8, 14, 20, 12, 22, 16, 10, 18, 20, 12, 8, 16, 18, 10, 14, 8, 12, 6];

let estado = armazenar.ler(CHAVE, null, true) || { mensagens: [], audioSempre: false, usadas: [] };
let ui = null; // referências da tela montada
let pendente = null; // pergunta vinda de outra tela
let tocando = null;

const salvar = () => armazenar.gravar(CHAVE, estado, true);
export const perguntarDepois = (texto) => { pendente = texto; };
export function reiniciarConversa() { estado = { mensagens: [], audioSempre: false, usadas: [] }; salvar(); }

export function telaChat(ctx) {
  return `
<div class="chat">
  <header class="chat-cab">
    <a class="voltar-chat" href="#/hoje" aria-label="Voltar para Hoje">${ICONES.voltar}</a>
    <img src="/img/icone.svg" alt="">
    <div class="quem"><strong>Cid</strong><span id="chat-status">${ctx.ia ? 'online' : 'modo demonstração'}</span></div>
    <button type="button" class="alternar-audio" id="alternar-audio" role="switch" aria-checked="${estado.audioSempre}" aria-label="Responder sempre em áudio"></button>
  </header>
  <p class="chat-faixa">${ctx.ia
    ? 'O Cid usa os dados de satélite da NASA, a previsão e o histórico da sua roça. Ele sugere; quem decide é você.'
    : '<strong>Modo demonstração:</strong> respostas prontas com os dados da roça. Com a chave da IA no servidor, o Cid conversa de verdade.'}</p>
  <div class="mensagens" id="mensagens" aria-live="polite"></div>
  <div class="sugestoes" id="sugestoes"></div>
  <footer class="chat-rodape">
    <form id="chat-form" autocomplete="off">
      <label for="chat-texto" class="so-leitor">Mensagem</label>
      <input id="chat-texto" maxlength="500" placeholder="Escreva ou segure o microfone">
      <span class="gravando-info" id="gravando-info" hidden aria-live="polite"><i></i><span id="gravando-tempo">0:00</span> <span id="gravando-dica">gravando… solte para enviar</span></span>
    </form>
    <button type="button" class="mic" id="mic" aria-label="Segure para gravar áudio">${ICONES.mic}</button>
  </footer>
</div>`;
}

export function montarChat(ctx) {
  ui = {
    ctx,
    lista: document.getElementById('mensagens'),
    sugestoes: document.getElementById('sugestoes'),
    status: document.getElementById('chat-status'),
    form: document.getElementById('chat-form'),
    texto: document.getElementById('chat-texto'),
    mic: document.getElementById('mic'),
    gravandoInfo: document.getElementById('gravando-info'),
    gravandoTempo: document.getElementById('gravando-tempo'),
    gravandoDica: document.getElementById('gravando-dica'),
    alternar: document.getElementById('alternar-audio'),
    digitando: false,
    gravacao: null,
    segurando: false,
    iniciando: false,
    tempoSegurado: 0,
  };
  if (!estado.mensagens.length) {
    estado.mensagens.push({
      papel: 'cid',
      texto: `${saudacao()}, ${ctx.fazenda.produtor.nome}! Pode perguntar falando ou escrevendo. Pra mandar áudio, segure o microfone amarelo enquanto fala.`,
      hora: horaAgora(),
    });
    salvar();
  }
  desenharAlternar();
  desenharTudo();

  ui.form.addEventListener('submit', (e) => {
    e.preventDefault();
    const t = ui.texto.value.trim();
    if (t) { ui.texto.value = ''; enviar(t); }
  });
  ui.mic.addEventListener('pointerdown', pressionar);
  ui.mic.addEventListener('pointerup', soltar);
  ui.mic.addEventListener('pointercancel', soltar);
  ui.mic.addEventListener('lostpointercapture', soltar);
  ui.mic.addEventListener('contextmenu', (e) => e.preventDefault());
  ui.mic.addEventListener('keydown', (e) => {
    if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); pressionar(); }
  });
  ui.mic.addEventListener('keyup', (e) => {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); soltar(); }
  });
  ui.alternar.addEventListener('click', () => {
    estado.audioSempre = !estado.audioSempre;
    estado.mensagens.push({ papel: 'aviso', texto: estado.audioSempre ? 'O Cid vai responder sempre em áudio' : 'O Cid vai responder em texto' });
    salvar();
    desenharAlternar();
    desenharTudo();
  });
  ui.lista.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tocar]');
    if (b) tocar(Number(b.dataset.tocar));
  });
  ui.sugestoes.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-sugestao]');
    if (b) enviar(b.dataset.sugestao);
  });

  if (pendente) { const t = pendente; pendente = null; enviar(t); }
}

export function desmontarChat() {
  ui?.gravacao?.cancelar?.();
  clearInterval(ui?.relogio);
  clearTimeout(ui?.paradaPendente);
  clearTimeout(ui?.limite);
  ui = null;
  tocando = null;
}

// ---------- desenho ----------
function desenharAlternar() {
  ui.alternar.setAttribute('aria-checked', String(estado.audioSempre));
  ui.alternar.title = estado.audioSempre ? 'Respondendo sempre em áudio' : 'Respondendo em texto';
  ui.alternar.innerHTML = estado.audioSempre ? ICONES.pessoaFalando : ICONES.balao;
}

function desenharTudo() {
  if (!ui) return;
  ui.lista.replaceChildren(...estado.mensagens.slice(-30).map((m, i, arr) => bolha(m, estado.mensagens.length - arr.length + i)));
  if (ui.digitando) {
    const d = document.createElement('div');
    d.className = 'digitando';
    d.textContent = ui.digitando;
    ui.lista.appendChild(d);
  }
  ui.lista.scrollTop = ui.lista.scrollHeight;
  const restantes = SUGESTOES.filter((s) => !estado.usadas.includes(s)).slice(0, 3);
  ui.sugestoes.replaceChildren(...restantes.map((s) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.sugestao = s;
    b.textContent = s;
    return b;
  }));
  ui.status.textContent = ui.digitando ? ui.digitando.replace('…', '') : ui.ctx.ia ? 'online' : 'modo demonstração';
}

function bolha(m, indice) {
  const el = document.createElement('div');
  if (m.papel === 'aviso') {
    el.className = 'bolha aviso';
    el.setAttribute('role', 'status');
    el.textContent = m.texto;
    return el;
  }
  const doProdutor = m.papel === 'produtor';
  const emAudio = m.audio || (!doProdutor && m.falada);
  el.className = `bolha ${m.papel}${emAudio ? ' audio' : ''}${tocando === indice ? ' tocando' : ''}`;
  if (emAudio) {
    const onda = document.createElement('div');
    onda.className = 'onda';
    onda.innerHTML = `<button type="button" data-tocar="${indice}" aria-label="${tocando === indice ? 'Parar áudio' : doProdutor ? 'Ouvir sua pergunta' : 'Ouvir resposta do Cid'}">${tocando === indice ? ICONES.pause : ICONES.play}</button><span class="barras" aria-hidden="true">${ONDA.map((h) => `<i style="height:${h}px"></i>`).join('')}</span>`;
    el.appendChild(onda);
  }
  const p = document.createElement('p');
  p.textContent = doProdutor && m.audio ? `“${m.texto}”` : m.texto;
  el.appendChild(p);
  if (m.link) {
    const a = document.createElement('a');
    a.className = 'link-bolha';
    a.href = m.link.href;
    a.textContent = m.link.rotulo;
    el.appendChild(a);
  }
  const pe = document.createElement('div');
  pe.className = 'bolha-pe';
  if (!doProdutor && !emAudio) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'botao-ouvir claro';
    b.style.minHeight = '32px';
    b.style.fontSize = '12px';
    b.dataset.tocar = indice;
    b.setAttribute('aria-label', tocando === indice ? 'Parar leitura' : 'Ouvir esta mensagem');
    b.innerHTML = `${ICONES.falante}<span>${tocando === indice ? 'Parar' : 'Ouvir'}</span>`;
    pe.appendChild(b);
  }
  const meta = document.createElement('span');
  meta.className = 'bolha-meta';
  meta.textContent = [m.hora, m.audio ? 'áudio' : '', m.origem === 'demo' ? 'resposta pronta' : ''].filter(Boolean).join(' · ');
  pe.appendChild(meta);
  el.appendChild(pe);
  return el;
}

function tocar(indice) {
  if (tocando === indice) { pararFala(); tocando = null; desenharTudo(); return; }
  tocando = indice;
  desenharTudo();
  falar(estado.mensagens[indice].texto, {
    aoTerminar: () => { if (tocando === indice) { tocando = null; desenharTudo(); } },
  });
}

// ---------- conversa ----------
async function enviar(texto, { deAudio = false } = {}) {
  if (!ui || ui.digitando) return;
  pararFala();
  tocando = null;
  if (SUGESTOES.includes(texto) && !estado.usadas.includes(texto)) estado.usadas.push(texto);
  estado.mensagens.push({ papel: 'produtor', texto, audio: deAudio, hora: horaAgora() });
  ui.digitando = deAudio || estado.audioSempre ? 'gravando a resposta em áudio…' : 'respondendo…';
  salvar();
  desenharTudo();

  const ctx = ui.ctx;
  let resposta;
  let origem = 'ia';
  if (ctx.ia) {
    try {
      const r = await fetch('/api/cid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mensagens: estado.mensagens.filter((m) => m.papel !== 'aviso').map((m) => ({ papel: m.papel, texto: m.texto })),
          registros: ctx.registros,
        }),
      });
      const corpo = await r.json();
      if (!r.ok) throw Object.assign(new Error(corpo.erro || r.status), { status: r.status });
      resposta = corpo.resposta;
    } catch (e) {
      console.warn('IA indisponível:', e.message);
      // No limite por minuto da IA, responde com os dados salvos sem alarde
      if (e.status !== 429) estado.mensagens.push({ papel: 'aviso', texto: 'Sem conexão com a IA agora. Respondo com os dados salvos.' });
    }
  } else {
    await new Promise((ok) => setTimeout(ok, 700));
  }
  if (!resposta) { resposta = respostaLocal(texto, ctx); origem = 'demo'; }
  if (!ui) return; // saiu da tela

  const falada = deAudio || estado.audioSempre;
  const msg = { papel: 'cid', texto: resposta, hora: horaAgora(), falada, origem, link: linkPara(resposta, texto) };
  estado.mensagens.push(msg);
  ui.digitando = false;
  salvar();
  if (falada) tocar(estado.mensagens.length - 1);
  else desenharTudo();
}

function linkPara(resposta, pergunta) {
  const t = `${resposta} ${pergunta}`.toLowerCase();
  if (/plantio|caminho|depois do milho|safrinha|rota[cç]/.test(t)) return { href: '#/plantio', rotulo: 'Ver os 3 caminhos' };
  if (/nasa|sat[eé]lite|hist[oó]ric/.test(t) && !/previs/.test(t)) return { href: '#/previsao/clima', rotulo: 'Ver o clima da roça' };
  if (/chuva|previs|tempo|semana/.test(t)) return { href: '#/previsao', rotulo: 'Ver previsão' };
  return null;
}

// ---------- gravação: segurar para falar ----------
// Grava enquanto o botão está pressionado. Ao soltar, espera 1 segundo antes de
// parar: se a pessoa soltou sem querer, é só apertar de novo que continua.
// Um toque rápido não envia nada, só lembra que é para segurar.
const TOLERANCIA_MS = 1000;
const TOQUE_CURTO_MS = 400;

function pressionar(e) {
  if (!ui || ui.digitando) return;
  if (e?.pointerId !== undefined) {
    e.preventDefault();
    try { ui.mic.setPointerCapture(e.pointerId); } catch { /* sem captura */ }
  }
  if (ui.segurando) return;
  ui.segurando = true;
  ui.inicioToque = Date.now();
  clearTimeout(ui.paradaPendente);
  ui.paradaPendente = null;
  if (ui.gravacao || ui.iniciando) return atualizarGravando();
  iniciarGravacao();
}

function soltar() {
  if (!ui || !ui.segurando) return;
  ui.segurando = false;
  ui.tempoSegurado += Date.now() - ui.inicioToque;
  atualizarGravando();
  clearTimeout(ui.paradaPendente);
  ui.paradaPendente = setTimeout(() => {
    if (!ui || ui.segurando) return;
    ui.paradaPendente = null;
    encerrarGravacao();
  }, TOLERANCIA_MS);
}

async function iniciarGravacao() {
  pararFala();
  tocando = null;
  ui.tempoSegurado = 0;
  ui.iniciando = true;
  const ctx = ui.ctx;
  try {
    if (ctx.ia && podeGravar) {
      const g = await gravarAudio();
      if (!ui) return g.cancelar();
      ui.gravacao = Object.assign(g, { tipo: 'ia' });
    } else if (podeReconhecer) {
      ui.ouvido = '';
      const g = reconhecerFala({
        aoResultado: (t) => { if (ui) ui.ouvido = t; },
        aoErro: (erro) => console.warn('Reconhecimento:', erro),
        aoFim: () => {
          if (!ui) return;
          if (ui.aguardandoReconhecimento) { ui.aguardandoReconhecimento = false; finalizarReconhecimento(); }
          else g.terminou = true; // o navegador parou sozinho; envia quando a pessoa soltar
        },
      });
      ui.gravacao = Object.assign(g, { tipo: 'navegador' });
    } else {
      // Sem microfone utilizável: demonstra com uma pergunta pronta
      ui.gravacao = { tipo: 'demo', parar() {}, cancelar() {} };
    }
  } catch (e) {
    console.warn('Microfone:', e.message);
    if (!ui) return;
    ui.iniciando = false;
    ui.segurando = false;
    clearTimeout(ui.paradaPendente);
    return avisar('Não consegui usar o microfone. Libere o acesso ou escreva a pergunta.');
  }
  ui.iniciando = false;
  // Soltou antes de o microfone começar (por exemplo, no pedido de permissão)
  if (ui.encerrarAoIniciar) { ui.encerrarAoIniciar = false; return encerrarGravacao(); }
  mostrarGravando(true);
  ui.limite = setTimeout(() => { if (ui?.gravacao) { ui.segurando = false; encerrarGravacao(); } }, 60000);
}

async function encerrarGravacao() {
  if (!ui) return;
  if (ui.iniciando) { ui.encerrarAoIniciar = true; return; }
  const g = ui.gravacao;
  if (!g) return;
  clearTimeout(ui.limite);
  const segurado = ui.tempoSegurado + (ui.segurando ? Date.now() - ui.inicioToque : 0);
  ui.gravacao = null;
  ui.segurando = false;
  mostrarGravando(false);
  if (segurado < TOQUE_CURTO_MS) {
    g.cancelar();
    return avisar('Para mandar áudio, segure o microfone enquanto fala e solte quando terminar.');
  }
  if (g.tipo === 'demo') return enviar('Dá pra plantar o feijão essa semana?', { deAudio: true });
  if (g.tipo === 'navegador') {
    if (g.terminou) return finalizarReconhecimento();
    ui.aguardandoReconhecimento = true;
    return g.parar(); // o envio acontece no aoFim
  }
  const audio = await g.parar();
  if (!ui) return;
  ui.digitando = 'ouvindo seu áudio…';
  desenharTudo();
  try {
    const r = await fetch('/api/transcrever', { method: 'POST', headers: { 'Content-Type': audio.type || 'audio/webm' }, body: audio });
    const corpo = await r.json();
    if (!r.ok) throw Object.assign(new Error(corpo.erro || r.status), { status: r.status });
    if (!ui) return;
    ui.digitando = false;
    if (!corpo.texto) throw new Error('não entendi');
    enviar(corpo.texto, { deAudio: true });
  } catch (e) {
    console.warn('Transcrição:', e.message);
    if (!ui) return;
    ui.digitando = false;
    avisar(e.status === 429
      ? 'O Cid está atendendo muita gente agora. Tente de novo em alguns segundos ou escreva a pergunta.'
      : 'Não consegui entender o áudio. Tente de novo, mais perto do celular.');
  }
}

function finalizarReconhecimento() {
  if (!ui) return;
  const texto = ui.ouvido;
  ui.ouvido = '';
  if (texto) enviar(texto, { deAudio: true });
  else avisar('Não ouvi nada. Segure o microfone e fale a sua pergunta.');
}

function avisar(texto) {
  estado.mensagens.push({ papel: 'aviso', texto });
  salvar();
  desenharTudo();
}

function mostrarGravando(sim) {
  ui.mic.classList.toggle('gravando', sim);
  ui.texto.hidden = sim;
  ui.gravandoInfo.hidden = !sim;
  clearInterval(ui.relogio);
  if (sim) {
    const inicio = Date.now();
    ui.gravandoTempo.textContent = '0:00';
    ui.relogio = setInterval(() => {
      const s = Math.floor((Date.now() - inicio) / 1000);
      if (ui) ui.gravandoTempo.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }, 500);
  }
  atualizarGravando();
}

function atualizarGravando() {
  if (!ui) return;
  const soltou = Boolean(ui.gravacao) && !ui.segurando;
  ui.gravandoDica.textContent = soltou ? 'enviando… aperte de novo para continuar' : 'gravando… solte para enviar';
  ui.mic.classList.toggle('soltou', soltou);
}

// ---------- respostas prontas (sem IA) ----------
function respostaLocal(texto, ctx) {
  const t = texto.toLowerCase();
  const { nasa, plano } = ctx;
  const r = nasa.periodos.recente;
  const a = nasa.periodos.antigo;
  const s = nasa.situacaoAtual;
  const dias = diasPrevistos(ctx);
  const semana = dias.slice(0, 7);
  const total = Math.round(semana.reduce((x, d) => x + d.mm, 0));
  const forte = semana.find((d) => d.mm >= 10);
  const proxima = semana.find((d) => d.mm >= 2);

  const especifico = plano.caminhos.find((c) => t.includes(c.nome.toLowerCase()) || (c.id === 'sorgo' && /sorgo|braqui/.test(t)));
  if (especifico) {
    return `${especifico.fala} Os maiores riscos: ${especifico.riscos.join(', ').toLowerCase()}. Antes de decidir, falta saber: ${especifico.lacunas.join(' e ').toLowerCase()}.`;
  }
  if (/depois do milho|o que (eu )?plant|safrinha|rota[cç]|caminho/.test(t)) {
    const [c1, c2, c3] = plano.caminhos;
    return `Pra área do milho, depois da colheita de fevereiro, tem três caminhos. ${c1.nome}: preço garantido na cooperativa, mas o outono anda seco. ${c2.nome}: colhe antes da geada e ajuda o solo, mas a venda não é garantida. ${c3.nome}: aguenta melhor a seca e protege a terra. A comparação completa está na aba Plantio. Quem decide é o senhor.`;
  }
  const soloComparado = s.umidadeSolo - s.umidadeSoloNormal >= 5 ? 'acima do normal' : s.umidadeSolo - s.umidadeSoloNormal <= -5 ? 'abaixo do normal' : 'perto do normal';
  const chuvaComparada = s.chuvaUltimos30Dias > s.chuvaNormal30Dias * 1.2 ? 'acima do normal' : s.chuvaUltimos30Dias < s.chuvaNormal30Dias * 0.8 ? 'abaixo do normal' : 'perto do normal';

  if (/feij/.test(t)) {
    if (forte) return `Vem chuva forte ${nomeDoDia(forte.iso)}, uns ${Math.round(forte.mm)} milímetros. Uma ideia é esperar ela passar e plantar o feijão com a terra úmida, sem enxurrada. A decisão é sua.`;
    return `A semana deve ter uns ${total} milímetros de chuva, e a umidade do solo está ${soloComparado}. Confira a previsão antes de decidir; quem decide é o senhor.`;
  }
  if (/chuv|tempo|previs|semana/.test(t)) {
    if (!proxima) return `A previsão não mostra chuva que valha nos próximos 7 dias. Se precisar irrigar, o fim da tarde perde menos água.`;
    return `A próxima chuva é ${nomeDoDia(proxima.iso)}, uns ${Math.round(proxima.mm)} milímetros. Na semana toda devem cair uns ${total} milímetros. Te aviso se a previsão mudar.`;
  }
  if (/solo|terra|umid/.test(t)) {
    return `O satélite da NASA mostra a umidade do solo nas raízes em ${s.umidadeSolo} de 100, quando o normal da época é ${s.umidadeSoloNormal}. Choveu ${s.chuvaUltimos30Dias} milímetros nos últimos 30 dias, ${chuvaComparada}.`;
  }
  if (/geada|frio/.test(t)) {
    return `Pelos dados de satélite da NASA, em ${r.pctAnosGeadaSafrinha}% dos anos fez frio de geada entre meados de maio e julho na sua região. Por isso, o que for plantado depois do milho precisa ir cedo, até o começo de março.`;
  }
  if (/calor|quente|seca|clima|mud/.test(t)) {
    return `O clima da sua roça mudou. Pelos dados de satélite da NASA, os dias acima de 35 graus passaram de ${Math.round(a.diasCalorAno)} para ${Math.round(r.diasCalorAno)} por ano, e abril e maio perderam um terço da chuva.`;
  }
  return 'Posso ajudar com a previsão, a umidade do solo e o que plantar na próxima safra. Pergunte do seu jeito, falando ou escrevendo.';
}

function diasPrevistos(ctx) {
  const d = ctx.previsao.daily;
  const hoje = hojeISO();
  return d.time.map((iso, i) => ({ iso, mm: d.precipitation_sum[i] })).filter((x) => x.iso >= hoje);
}
