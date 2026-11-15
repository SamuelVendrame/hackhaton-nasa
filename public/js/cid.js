// Conversa com o Cid: texto ou áudio, resposta lida em voz alta.
// Com a IA ligada no servidor (Groq), o áudio é transcrito e respondido pela IA.
// Sem IA, o microfone usa o reconhecimento do navegador (Chrome) e as
// respostas vêm de regras sobre os mesmos dados da roça.

import { ICONES, armazenar, horaAgora, saudacao, nomeDoDia, hojeISO, fmtDataCurta } from './util.js';
import { salvarRegistro } from './registros.js';
import { falar, pararFala, duracaoEstimada, duracaoDoAudio, podeGravar, gravarAudio, podeReconhecer, reconhecerFala } from './voz.js';

const CHAVE = 'semeia:conversa';
export const CHAVE_PREFERENCIAS = 'semeia:preferencias';
const SUGESTOES = ['O que planto depois do milho?', 'Apliquei 100 kg de ureia no milho ontem', 'Quando vem a chuva?', 'Dá pra plantar o feijão essa semana?', 'Como está o solo?'];
const PADRAO = { escrever: false, sugestoes: true };

let estado = armazenar.ler(CHAVE, null, true) || { mensagens: [], usadas: [], corrigindo: null };
let prefs = { ...PADRAO, ...armazenar.ler(CHAVE_PREFERENCIAS, {}) };
let ui = null; // referências da tela montada
let pendente = null; // pergunta vinda de outra tela

const salvar = () => armazenar.gravar(CHAVE, estado, true);
const salvarPrefs = () => armazenar.gravar(CHAVE_PREFERENCIAS, prefs);
export const perguntarDepois = (texto) => { pendente = texto; };
export function reiniciarConversa() {
  estado = { mensagens: [], usadas: [] };
  prefs = { ...PADRAO };
  salvar();
}

const interruptor = (id, ligado, titulo, descricao) => `
  <div class="opcao">
    <span class="opcao-texto" id="${id}-rotulo"><strong>${titulo}</strong><small id="${id}-desc">${descricao}</small></span>
    <button type="button" class="interruptor" id="${id}" role="switch" aria-checked="${ligado}" aria-labelledby="${id}-rotulo" aria-describedby="${id}-desc"><span></span></button>
  </div>`;

export function telaChat(ctx) {
  return `
<div class="chat${prefs.escrever ? ' modo-escrita' : ''}">
  <header class="chat-cab">
    <a class="voltar-chat" href="#/hoje" aria-label="Voltar para Hoje">${ICONES.voltar}</a>
    <img src="/img/icone.svg" alt="">
    <div class="quem"><strong>Cid</strong><span id="chat-status">${ctx.ia ? 'online' : 'modo demonstração'}</span></div>
    <button type="button" class="menu-botao" id="menu-botao" aria-label="Opções da conversa" aria-expanded="false" aria-controls="chat-menu">${ICONES.menu}</button>
  </header>
  <div class="mensagens" id="mensagens" aria-live="polite"></div>
  <div class="sugestoes" id="sugestoes"></div>
  <footer class="chat-rodape">
    <form id="chat-form" autocomplete="off">
      <label for="chat-texto" class="so-leitor">Mensagem</label>
      <input id="chat-texto" maxlength="500" placeholder="${prefs.escrever ? 'Escreva sua pergunta' : 'Escreva ou segure o microfone'}">
      <span class="gravando-info" id="gravando-info" hidden aria-live="polite"><i></i><span id="gravando-tempo">0:00</span> <span id="gravando-dica">gravando… solte para enviar</span></span>
    </form>
    <button type="submit" form="chat-form" class="enviar" id="enviar" aria-label="Enviar mensagem">${ICONES.enviar}</button>
    <button type="button" class="mic" id="mic" aria-label="Segure para gravar áudio">${ICONES.mic}</button>
  </footer>

  <div class="gaveta-fundo" id="gaveta-fundo"></div>
  <aside class="gaveta" id="chat-menu" aria-label="Opções da conversa" aria-hidden="true">
    <div class="gaveta-cab">
      <h2>Opções</h2>
      <button type="button" class="gaveta-fechar" id="gaveta-fechar" aria-label="Fechar opções">${ICONES.fechar}</button>
    </div>
    ${interruptor('op-escrever', prefs.escrever, 'Conversar por escrito', 'Sem áudio: o microfone vira botão de enviar e o Cid não fala. Para quem não ouve ou não fala.')}
    ${interruptor('op-sugestoes', prefs.sugestoes, 'Sugestões de mensagens', 'Perguntas prontas acima do campo de texto.')}
    <button type="button" class="botao contorno" id="nova-conversa">Começar conversa nova</button>
  </aside>
</div>`;
}

export function montarChat(ctx) {
  const $ = (id) => document.getElementById(id);
  ui = {
    ctx,
    raiz: document.querySelector('.chat'),
    lista: $('mensagens'),
    sugestoes: $('sugestoes'),
    status: $('chat-status'),
    form: $('chat-form'),
    texto: $('chat-texto'),
    mic: $('mic'),
    enviarBotao: $('enviar'),
    gravandoInfo: $('gravando-info'),
    gravandoTempo: $('gravando-tempo'),
    gravandoDica: $('gravando-dica'),
    menuBotao: $('menu-botao'),
    gaveta: $('chat-menu'),
    gavetaFundo: $('gaveta-fundo'),
    opEscrever: $('op-escrever'),
    opSugestoes: $('op-sugestoes'),
    digitando: false,
    gravacao: null,
    segurando: false,
    iniciando: false,
    tempoSegurado: 0,
  };
  if (!estado.mensagens.length) {
    estado.mensagens.push({
      papel: 'cid',
      texto: prefs.escrever
        ? `${saudacao()}, ${ctx.fazenda.produtor.nome}! Escreva a sua pergunta ou toque numa das sugestões.`
        : `${saudacao()}, ${ctx.fazenda.produtor.nome}! Pode perguntar falando ou escrevendo. Pra mandar áudio, segure o microfone amarelo enquanto fala.`,
      hora: horaAgora(),
    });
    salvar();
  }
  ui.gaveta.inert = true;
  desenharTudo();
  desenharBotoes();

  ui.form.addEventListener('submit', (e) => {
    e.preventDefault();
    const t = ui.texto.value.trim();
    if (t) { ui.texto.value = ''; desenharBotoes(); enviar(t); }
  });
  ui.texto.addEventListener('input', desenharBotoes);
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
  ui.lista.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tocar]');
    if (b) return tocar(Number(b.dataset.tocar));
    const anotar = e.target.closest('[data-anotar]');
    if (anotar) responderAnotacao(Number(anotar.dataset.indice), anotar.dataset.anotar);
  });
  ui.sugestoes.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-sugestao]');
    if (b) enviar(b.dataset.sugestao);
  });

  // Menu de opções
  ui.menuBotao.addEventListener('click', () => abrirMenu(true));
  $('gaveta-fechar').addEventListener('click', () => abrirMenu(false));
  ui.gavetaFundo.addEventListener('click', () => abrirMenu(false));
  ui.gaveta.addEventListener('keydown', (e) => { if (e.key === 'Escape') abrirMenu(false); });
  ui.opEscrever.addEventListener('click', () => {
    prefs.escrever = !prefs.escrever;
    salvarPrefs();
    if (prefs.escrever) { pararReproducao(); ui.gravacao?.cancelar?.(); ui.gravacao = null; }
    estado.mensagens.push({ papel: 'aviso', texto: prefs.escrever ? 'Conversa por escrito: sem áudio' : 'Conversa por voz: segure o microfone para falar' });
    salvar();
    ui.raiz.classList.toggle('modo-escrita', prefs.escrever);
    ui.texto.placeholder = prefs.escrever ? 'Escreva sua pergunta' : 'Escreva ou segure o microfone';
    ui.opEscrever.setAttribute('aria-checked', String(prefs.escrever));
    desenharBotoes();
    desenharTudo();
  });
  ui.opSugestoes.addEventListener('click', () => {
    prefs.sugestoes = !prefs.sugestoes;
    salvarPrefs();
    ui.opSugestoes.setAttribute('aria-checked', String(prefs.sugestoes));
    desenharTudo();
  });
  $('nova-conversa').addEventListener('click', () => {
    pararReproducao();
    esquecerGravacoes();
    estado = { mensagens: [], usadas: [] };
    salvar();
    abrirMenu(false);
    desmontarChat();
    montarChat(ctx);
  });

  if (pendente) { const t = pendente; pendente = null; enviar(t); }
}

function abrirMenu(abrir) {
  if (!ui) return;
  ui.raiz.classList.toggle('menu-aberto', abrir);
  ui.gaveta.inert = !abrir;
  ui.gaveta.setAttribute('aria-hidden', String(!abrir));
  ui.menuBotao.setAttribute('aria-expanded', String(abrir));
  // espera a gaveta ficar visível para conseguir receber o foco
  // sem rolar a tela: o foco numa gaveta ainda entrando empurrava a conversa para o lado
  if (abrir) setTimeout(() => ui?.opEscrever.focus({ preventScroll: true }), 60);
  else ui.menuBotao.focus({ preventScroll: true });
}

export function desmontarChat() {
  ui?.gravacao?.cancelar?.();
  clearInterval(ui?.relogio);
  clearTimeout(ui?.paradaPendente);
  clearTimeout(ui?.limite);
  pararReproducao();
  ui = null;
}

// ---------- desenho ----------
// Microfone quando o campo está vazio; botão de enviar quando há texto ou no modo escrito.
function desenharBotoes() {
  if (!ui) return;
  const comTexto = ui.texto.value.trim().length > 0;
  const mostrarEnviar = prefs.escrever || (comTexto && !ui.gravacao);
  ui.enviarBotao.hidden = !mostrarEnviar;
  ui.mic.hidden = mostrarEnviar;
}

function desenharTudo() {
  if (!ui) return;
  const itens = estado.mensagens.slice(-30).map((m, i, arr) => bolha(m, estado.mensagens.length - arr.length + i));
  if (estado.mensagens.length <= 30) {
    // Aviso de onde vêm as respostas: só no começo da conversa, rola junto
    const intro = document.createElement('p');
    intro.className = 'chat-intro';
    intro.textContent = ui.ctx.ia
      ? 'O Cid usa dados de satélite da NASA, a previsão do tempo e o histórico da sua roça. Ele sugere; quem decide é você.'
      : 'Modo demonstração: respostas prontas com os dados da roça. Com a chave da IA no servidor, o Cid conversa de verdade.';
    itens.unshift(intro);
  }
  ui.lista.replaceChildren(...itens);
  if (ui.digitando) {
    const d = document.createElement('div');
    d.className = 'digitando';
    d.textContent = ui.digitando;
    ui.lista.appendChild(d);
  }
  ui.lista.scrollTop = ui.lista.scrollHeight;
  const restantes = prefs.sugestoes ? SUGESTOES.filter((s) => !estado.usadas.includes(s)).slice(0, 3) : [];
  ui.sugestoes.hidden = !restantes.length;
  ui.sugestoes.replaceChildren(...restantes.map((s) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.sugestao = s;
    b.textContent = s;
    return b;
  }));
  ui.status.textContent = ui.digitando ? ui.digitando.replace('…', '') : ui.ctx.ia ? 'online' : 'modo demonstração';
}

// ---------- player de áudio (estilo WhatsApp) ----------
const gravacoes = new Map(); // id da mensagem → áudio gravado pelo produtor (só nesta sessão)
let rep = null; // reprodução em andamento

const fmtTempo = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const duracaoDe = (m) => m.duracaoMs || duracaoEstimada(m.texto);

// Ondas próprias de cada áudio (sorteio fixo pelo texto), com quantidade de barras pela duração
function ondaDe(m) {
  let semente = 0;
  for (const c of m.texto) semente = (semente * 31 + c.charCodeAt(0)) >>> 0;
  const aleatorio = () => { semente = (semente * 1664525 + 1013904223) >>> 0; return semente / 4294967296; };
  const n = Math.max(16, Math.min(34, Math.round(duracaoDe(m) / 1000 * 1.6) + 12));
  return Array.from({ length: n }, (_, i) => Math.round(5 + aleatorio() * 17 * (0.55 + 0.45 * Math.sin((i / n) * Math.PI))));
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
  const emAudio = !prefs.escrever && (m.audio || (!doProdutor && m.falada));
  const ativo = rep?.indice === indice;
  el.className = `bolha ${m.papel}${emAudio ? ' audio' : ''}${m.sucesso ? ' sucesso' : ''}${ativo && rep.tocando ? ' tocando' : ''}`;
  el.dataset.indice = indice;
  if (emAudio) {
    const barras = ondaDe(m).map((h) => `<i style="height:${h}px"></i>`).join('');
    const onda = document.createElement('div');
    onda.className = 'onda';
    onda.style.setProperty('--progresso', ativo ? rep.mostrado : 0);
    onda.innerHTML = `
      <button type="button" class="play" data-tocar="${indice}"></button>
      <span class="trilha" aria-hidden="true"><span class="barras">${barras}</span><span class="barras tocadas">${barras}</span><span class="ponteiro"></span></span>
      <span class="tempo">${fmtTempo(ativo ? rep.mostrado * duracaoDe(m) : duracaoDe(m))}</span>`;
    el.appendChild(onda);
  }
  const p = document.createElement('p');
  p.textContent = doProdutor && m.audio ? `“${m.texto}”` : m.texto;
  el.appendChild(p);
  if (m.registro) el.appendChild(cartaoAnotacao(m, indice));
  if (m.link) {
    const a = document.createElement('a');
    a.className = 'link-bolha';
    a.href = m.link.href;
    a.textContent = m.link.rotulo;
    el.appendChild(a);
  }
  const pe = document.createElement('div');
  pe.className = 'bolha-pe';
  if (!doProdutor && !emAudio && !prefs.escrever) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'botao-ouvir claro ouvir-texto';
    b.dataset.tocar = indice;
    pe.appendChild(b);
  }
  const meta = document.createElement('span');
  meta.className = 'bolha-meta';
  meta.textContent = [m.hora, m.audio ? 'áudio' : '', m.origem === 'demo' ? 'resposta pronta' : ''].filter(Boolean).join(' · ');
  pe.appendChild(meta);
  el.appendChild(pe);
  pintarBotao(el, indice);
  return el;
}

// Ícone e rótulo do botão conforme o estado (tocando, pausado, parado)
function pintarBotao(el, indice) {
  const m = estado.mensagens[indice];
  const tocandoEste = rep?.indice === indice && rep.tocando;
  const play = el.querySelector('.play');
  if (play) {
    play.innerHTML = tocandoEste ? ICONES.pause : ICONES.play;
    play.setAttribute('aria-label', tocandoEste ? 'Pausar áudio' : m.papel === 'produtor' ? 'Ouvir sua pergunta' : 'Ouvir resposta do Cid');
  }
  const ouvir = el.querySelector('.ouvir-texto');
  if (ouvir) {
    ouvir.innerHTML = `${ICONES.falante}<span>${tocandoEste ? 'Parar' : 'Ouvir'}</span>`;
    ouvir.setAttribute('aria-label', tocandoEste ? 'Parar leitura' : 'Ouvir esta mensagem');
  }
  el.classList.toggle('tocando', tocandoEste);
}

function atualizarBolha(indice) {
  const el = ui?.lista.querySelector(`.bolha[data-indice="${indice}"]`);
  if (!el) return;
  pintarBotao(el, indice);
  const onda = el.querySelector('.onda');
  if (onda) {
    const m = estado.mensagens[indice];
    const ativo = rep?.indice === indice;
    const mostrado = ativo ? rep.mostrado : 0;
    onda.style.setProperty('--progresso', mostrado.toFixed(4));
    onda.querySelector('.tempo').textContent = fmtTempo(ativo && rep.tocando ? tempoTocado() : ativo && rep.audio ? rep.audio.currentTime * 1000 : duracaoDe(m));
  }
}

function tocar(indice) {
  // Tocar de novo no mesmo áudio: pausa ou continua (gravação) ou para (voz do Cid)
  if (rep?.indice === indice) {
    if (rep.audio) {
      if (rep.audio.paused) { rep.audio.play(); rep.tocando = true; animar(); } else { rep.audio.pause(); rep.tocando = false; }
      return atualizarBolha(indice);
    }
    return pararReproducao();
  }
  pararReproducao();
  const m = estado.mensagens[indice];
  const url = gravacoes.get(m.id);
  rep = { indice, tocando: true, mostrado: 0, alvo: 0, duracao: duracaoDe(m), audio: null };
  if (url) {
    rep.audio = new Audio(url);
    rep.audio.onended = () => terminar(indice);
    rep.audio.play().catch(() => terminar(indice));
  } else {
    // Voz do Cid: o relógio só anda quando a voz começa de fato, e cada frase
    // terminada acerta a posição e mede a velocidade real da voz.
    rep.fala = { total: 1, inicio: 0, fim: 0, desde: null, falando: false, palavra: 0, taxa: 0.0145, primeira: null };
    const daVez = () => (rep?.indice === indice ? rep.fala : null);
    falar(m.texto, {
      aoTerminar: () => terminar(indice),
      aoFrase: (f) => {
        const s = daVez();
        if (!s) return;
        const agora = performance.now();
        s.total = f.total;
        if (f.tipo === 'inicio') {
          Object.assign(s, { inicio: f.inicio, fim: f.fim, desde: agora, falando: true });
          if (s.primeira == null) s.primeira = agora;
        } else {
          if (s.falando && agora - s.desde > 300) {
            const medida = (f.fim - f.inicio) / (agora - s.desde);
            s.taxa = s.taxa * 0.4 + medida * 0.6;
          }
          Object.assign(s, { inicio: f.fim, fim: f.fim, falando: false, palavra: f.fim });
        }
      },
      aoPalavra: (pos, total) => { const s = daVez(); if (s) { s.palavra = Math.max(s.palavra, pos); s.total = total; } },
    });
    // Se o navegador não avisar o início da fala, começa o relógio assim mesmo
    setTimeout(() => { const s = daVez(); if (s && s.primeira == null) Object.assign(s, { desde: performance.now(), primeira: performance.now(), falando: true, fim: s.total }); }, 1500);
  }
  atualizarBolha(indice);
  animar();
}

// Posição de 0 a 1 do que está tocando agora
function posicaoAtual() {
  if (rep.audio) {
    const total = Number.isFinite(rep.audio.duration) && rep.audio.duration > 0 ? rep.audio.duration * 1000 : rep.duracao;
    return Math.min(1, (rep.audio.currentTime * 1000) / total);
  }
  const s = rep.fala;
  if (s.primeira == null) return 0;
  let chars = s.inicio;
  if (s.falando) chars = Math.min(s.fim, Math.max(s.palavra, s.inicio + (performance.now() - s.desde) * s.taxa));
  return Math.min(1, chars / s.total);
}

// Tempo mostrado: real, contado a partir de quando o som começou
function tempoTocado() {
  if (rep.audio) return rep.audio.currentTime * 1000;
  return rep.fala.primeira == null ? 0 : performance.now() - rep.fala.primeira;
}

function animar() {
  cancelAnimationFrame(rep?.quadro);
  const passo = () => {
    if (!rep || !rep.tocando) return;
    rep.alvo = posicaoAtual();
    rep.mostrado += (rep.alvo - rep.mostrado) * 0.35;
    atualizarBolha(rep.indice);
    rep.quadro = requestAnimationFrame(passo);
  };
  rep.quadro = requestAnimationFrame(passo);
}

function terminar(indice) {
  if (rep?.indice !== indice) return;
  cancelAnimationFrame(rep.quadro);
  rep.tocando = false;
  rep.mostrado = 1;
  atualizarBolha(indice);
  // como no WhatsApp: mostra o fim por um instante e volta ao começo
  setTimeout(() => { if (rep?.indice === indice && !rep.tocando) { rep = null; atualizarBolha(indice); } }, 500);
}

function pararReproducao() {
  pararFala();
  if (!rep) return;
  const { indice } = rep;
  cancelAnimationFrame(rep.quadro);
  rep.audio?.pause();
  rep = null;
  atualizarBolha(indice);
}

function esquecerGravacoes() {
  for (const url of gravacoes.values()) URL.revokeObjectURL(url);
  gravacoes.clear();
}

// ---------- conversa ----------
async function enviar(texto, { deAudio = false, gravacao = null } = {}) {
  if (!ui || ui.digitando) return;
  pararReproducao();
  if (SUGESTOES.includes(texto) && !estado.usadas.includes(texto)) estado.usadas.push(texto);
  const id = `m${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  if (gravacao?.url) gravacoes.set(id, gravacao.url);
  estado.mensagens.push({ id, papel: 'produtor', texto, audio: deAudio, duracaoMs: gravacao?.duracaoMs, hora: horaAgora() });
  const falada = deAudio && !prefs.escrever;
  const esperando = cartaoPendente();
  if (respondeuCartao(texto, falada)) return;
  ui.digitando = falada ? 'gravando a resposta em áudio…' : 'respondendo…';
  salvar();
  desenharTudo();

  const ctx = ui.ctx;
  let resposta;
  let registro = null;
  const indiceCorrecao = estado.corrigindo;
  const emCorrecao = indiceCorrecao != null ? estado.mensagens[indiceCorrecao]?.registro || null : null;
  let origem = 'ia';
  if (ctx.ia) {
    try {
      const r = await fetch('/api/cid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mensagens: estado.mensagens.filter((m) => m.papel !== 'aviso').map((m) => ({ papel: m.papel, texto: m.texto })),
          registros: ctx.registros,
          corrigindo: emCorrecao,
          esperando: !emCorrecao && esperando != null ? estado.mensagens[esperando]?.registro || null : null,
        }),
      });
      const corpo = await r.json();
      if (!r.ok) throw Object.assign(new Error(corpo.erro || r.status), { status: r.status });
      resposta = corpo.resposta;
      registro = corpo.registro || null;
    } catch (e) {
      console.warn('IA indisponível:', e.message);
      // No limite por minuto da IA, responde com os dados salvos sem alarde
      if (e.status !== 429) estado.mensagens.push({ papel: 'aviso', texto: 'Sem conexão com a IA agora. Respondo com os dados salvos.' });
    }
  } else {
    await new Promise((ok) => setTimeout(ok, 700));
  }
  if (!resposta) {
    origem = 'demo';
    registro = emCorrecao ? corrigirLocal(emCorrecao, texto, ctx) : registroLocal(texto, ctx);
    if (registro) resposta = `${emCorrecao ? 'Corrigido' : 'Entendi'}: ${descreverRegistro(registro, ctx).replace(/\.$/, '')}. Se estiver certo, diga "pode salvar". Se não, me fale o que corrigir.`;
    else if (emCorrecao) resposta = 'Não entendi o que mudar. Pode dizer de novo? Por exemplo: "foram 80 quilos" ou "foi na área do feijão".';
    else resposta = respostaLocal(texto, ctx);
  }
  if (!ui) return; // saiu da tela

  let sucesso = false;
  const anterior = esperando != null ? estado.mensagens[esperando] : null;
  if (registro && anterior?.registro && !emCorrecao && !anterior.registroEstado && mesmoRegistro(registro, anterior.registro)) {
    responderAnotacao(esperando, 'salvar');
    const area = ctx.fazenda.lavouras.find((l) => l.id === registro.area).nome.toLowerCase();
    resposta = fraseDeSucesso(anterior.registro, area);
    registro = null;
    sucesso = true;
  }
  const msg = { papel: 'cid', texto: resposta, hora: horaAgora(), falada, origem, registro, sucesso, link: registro || sucesso ? null : linkPara(resposta, texto) };
  estado.mensagens.push(msg);
  // Correção concluída: o cartão antigo dá lugar ao novo
  if (emCorrecao && registro && estado.mensagens[indiceCorrecao]) {
    estado.mensagens[indiceCorrecao].registroEstado = 'substituido';
    estado.corrigindo = null;
  }
  ui.digitando = false;
  salvar();
  desenharTudo();
  if (falada) tocar(estado.mensagens.length - 1);
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
  if (!ui || ui.digitando || prefs.escrever) return;
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
  pararReproducao();
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
    ui.duracaoReconhecida = Date.now() - ui.inicioGravacao;
    if (g.terminou) return finalizarReconhecimento();
    ui.aguardandoReconhecimento = true;
    return g.parar(); // o envio acontece no aoFim
  }
  const duracaoMs = Date.now() - ui.inicioGravacao;
  const audio = await g.parar();
  const gravacao = { url: URL.createObjectURL(audio), duracaoMs: (await duracaoDoAudio(audio)) || duracaoMs };
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
    enviar(corpo.texto, { deAudio: true, gravacao });
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
  if (texto) enviar(texto, { deAudio: true, gravacao: { duracaoMs: ui.duracaoReconhecida } });
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
    ui.inicioGravacao = inicio;
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

// ---------- anotações ditas na conversa ----------
// O Cid entende o relato ("apliquei 100 kg de ureia no milho ontem") e mostra um
// cartão para conferir. Nada é salvo sem o produtor tocar em Salvar.
function cartaoAnotacao(m, indice) {
  const r = m.registro;
  const area = ui.ctx.fazenda.lavouras.find((l) => l.id === r.area);
  const cartao = document.createElement('div');
  cartao.className = `anotacao${m.registroEstado ? ` ${m.registroEstado}` : ''}`;
  const novo = (tag, classe, texto) => { const e = document.createElement(tag); e.className = classe; e.textContent = texto; return e; };
  const nomeArea = area.nome.toLowerCase();
  const rotulos = { salvo: `Anotado na ${nomeArea}`, corrigindo: 'Corrigindo: diga ou escreva o que mudar', substituido: 'Trocada pela correção abaixo', descartado: 'Não anotado' };
  cartao.append(
    novo('span', 'anotacao-rotulo', rotulos[m.registroEstado] || `Anotar na ${nomeArea}`),
    novo('strong', 'anotacao-titulo', r.tipo === 'safra' ? `${r.safra}: ${r.cultura}` : r.produto),
    novo('span', 'anotacao-detalhe', r.tipo === 'safra' ? (r.nota || 'Safra passada') : `${r.quantidade} · ${fmtDataCurta(r.data)}`),
  );
  const acoes = document.createElement('div');
  acoes.className = 'linha-botoes';
  if (!m.registroEstado) {
    const botao = (acao, texto, classe) => {
      const b = novo('button', `botao pequeno ${classe}`, texto);
      b.type = 'button';
      b.dataset.anotar = acao;
      b.dataset.indice = indice;
      return b;
    };
    acoes.append(botao('salvar', 'Salvar', ''), botao('corrigir', 'Corrigir', 'contorno'));
  } else if (m.registroEstado === 'corrigindo') {
    const b = novo('button', 'botao pequeno contorno', 'Deixar como estava');
    b.type = 'button';
    b.dataset.anotar = 'manter';
    b.dataset.indice = indice;
    acoes.append(b);
  } else if (m.registroEstado === 'salvo') {
    const a = novo('a', 'link-bolha', 'Ver em Minha roça');
    a.href = `#/roca/${area.id}`;
    acoes.append(a);
  }
  cartao.append(acoes);
  return cartao;
}

function responderAnotacao(indice, acao) {
  const m = estado.mensagens[indice];
  if (!m?.registro) return;
  if (acao === 'manter' && m.registroEstado === 'corrigindo') {
    m.registroEstado = undefined;
    estado.corrigindo = null;
    salvar();
    return desenharTudo();
  }
  if (m.registroEstado) return;
  const r = m.registro;
  if (acao === 'salvar') {
    const item = r.tipo === 'safra'
      ? { safra: r.safra, cultura: r.cultura, nota: r.nota || undefined }
      : { data: r.data, produto: r.produto, qtd: r.quantidade };
    salvarRegistro(ui.ctx, r.area, r.tipo, item);
    m.registroEstado = 'salvo';
    salvar();
    desenharTudo();
  } else if (acao === 'corrigir') {
    // A correção acontece na própria conversa: o produtor fala ou escreve só o que muda
    if (estado.corrigindo != null && estado.mensagens[estado.corrigindo]) estado.mensagens[estado.corrigindo].registroEstado = undefined;
    m.registroEstado = 'corrigindo';
    estado.corrigindo = indice;
    estado.mensagens.push({ papel: 'aviso', texto: r.tipo === 'safra'
      ? 'Fale ou escreva o que mudar. Ex.: "foi na safrinha de 2022" ou "era soja".'
      : 'Fale ou escreva o que mudar. Ex.: "foram 80 quilos" ou "foi anteontem".' });
    salvar();
    desenharTudo();
    if (prefs.escrever) ui.texto.focus();
  }
}

const diasAtras = (n) => new Date(Date.now() - n * 86400000).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
const maiuscula = (v) => (v ? v[0].toLocaleUpperCase('pt-BR') + v.slice(1) : v);

function quandoFoi(iso) {
  if (iso === hojeISO()) return 'hoje';
  if (iso === diasAtras(1)) return 'ontem';
  return `no dia ${Number(iso.slice(8))}`;
}

function descreverRegistro(r, ctx) {
  const area = ctx.fazenda.lavouras.find((l) => l.id === r.area).nome.toLowerCase();
  if (r.tipo === 'safra') return `${r.safra.toLowerCase()}, ${r.cultura.toLowerCase()} na ${area}${r.nota ? `, ${r.nota}` : ''}.`;
  return `${r.quantidade} de ${r.produto.toLowerCase()} na ${area}, ${quandoFoi(r.data)}.`;
}

// Sem IA: reconhece os relatos mais comuns por padrões simples
function registroLocal(texto, ctx) {
  const t = texto.toLowerCase();
  const areaDita = t.match(/[áa]rea do (milho|feij)/)?.[1];
  const area = areaDita ? (areaDita === 'milho' ? 'milho' : 'feijao') : /feij/.test(t) ? 'feijao' : /milho/.test(t) ? 'milho' : null;
  if (!area || !ctx.fazenda.lavouras.some((l) => l.id === area)) return null;

  const ap = t.match(/(?:apliquei|joguei|passei|coloquei|botei|pus)\s+(\d+(?:[.,]\d+)?)\s*(kg|quilos?|t\b|toneladas?|l\b|litros?|sacos?)\s+de\s+([a-zà-ú0-9 -]+?)\s+(?:no|na|em)\b/);
  if (ap) {
    const unidade = /^(kg|q)/.test(ap[2]) ? 'kg' : /^t/.test(ap[2]) ? 't' : /^l/.test(ap[2]) ? 'L' : 'sacos';
    const data = /anteontem/.test(t) ? diasAtras(2) : /ontem/.test(t) ? diasAtras(1) : hojeISO();
    return { tipo: 'aplicacao', area, data, produto: maiuscula(ap[3].trim()), quantidade: `${ap[1].replace('.', ',')} ${unidade}/ha` };
  }
  const safra = t.match(/(safrinha|ver[aã]o)\s+(?:de\s+)?(\d{4}(?:\/\d{2})?)/);
  const cultura = t.match(/plantei\s+(soja|milho|feij[aã]o|trigo|sorgo|aveia|mandioca|braqui[aá]ria)/);
  if (safra && cultura) {
    const nota = t.match(/\b(perdi[^.,]*|quebr[^.,]*|deu [^.,]*|colhi [^.,]*)/)?.[1];
    return { tipo: 'safra', area, safra: `${maiuscula(safra[1].replace('verao', 'verão'))} ${safra[2]}`, cultura: maiuscula(cultura[1]), nota: nota || null };
  }
  return null;
}

// Sem IA: aplica a correção dita ("foram 80 quilos", "foi anteontem", "na área do feijão")
function corrigirLocal(anterior, texto, ctx) {
  const t = texto.toLowerCase();
  const r = { ...anterior };
  let mudou = false;
  const area = t.match(/(?:[áa]rea do |no |na )(milho|feij)/)?.[1];
  if (area) { r.area = area === 'milho' ? 'milho' : 'feijao'; mudou = true; }
  if (r.tipo === 'aplicacao') {
    const q = t.match(/(\d+(?:[.,]\d+)?)\s*(kg|quilos?|t\b|toneladas?|l\b|litros?|sacos?)/);
    if (q) {
      const unidade = /^(kg|q)/.test(q[2]) ? 'kg' : /^t/.test(q[2]) ? 't' : /^l/.test(q[2]) ? 'L' : 'sacos';
      r.quantidade = `${q[1].replace('.', ',')} ${unidade}/ha`;
      mudou = true;
    }
    const data = /anteontem/.test(t) ? diasAtras(2) : /\bontem\b/.test(t) ? diasAtras(1) : /\bhoje\b/.test(t) ? hojeISO() : null;
    if (data) { r.data = data; mudou = true; }
    const produto = t.match(/\bde ([a-zà-ú -]+?)(?:\s+(?:no|na|em)\b|[.,!?]|$)/)?.[1];
    if (produto && !/^\d/.test(produto)) { r.produto = maiuscula(produto.trim()); mudou = true; }
  } else {
    const safra = t.match(/(safrinha|ver[aã]o)\s+(?:de\s+)?(\d{4}(?:\/\d{2})?)/);
    if (safra) { r.safra = `${maiuscula(safra[1].replace('verao', 'verão'))} ${safra[2]}`; mudou = true; }
    const cultura = t.match(/(?:era|foi|plantei)\s+(soja|milho|feij[aã]o|trigo|sorgo|aveia|mandioca|braqui[aá]ria)/);
    if (cultura) { r.cultura = maiuscula(cultura[1]); mudou = true; }
  }
  return mudou && ctx.fazenda.lavouras.some((l) => l.id === r.area) ? r : null;
}

// ---------- responder ao cartão falando ou escrevendo ----------
// Com uma anotação esperando confirmação, "pode salvar" salva, "deixa pra lá"
// descarta e "não, foram 80 quilos" vira correção, sem precisar tocar nos botões.
const semAcento = (t) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[.,!?;:]+/g, ' ').replace(/\s+/g, ' ').trim();
// Confirmação pela intenção, não pela frase exata: palavra de "pode salvar" numa
// fala curta e sem nenhum sinal de correção ("tá certo, pode salvar, Cid")
const SINAL_CONFIRMA = /\b(sim|isso|pode|salva|salvar|salve|salvo|anota|anotar|anote|confirma|confirmo|confirmar|confirmado|certo|certinho|correto|exato|ok|okay|beleza|perfeito|fechado|positivo|bora)\b/;
const SINAL_CORRECAO = /\d|\b(nao|mas|porem|errad\w*|corrig\w*|foi|foram|era|troca|muda|faltou|verdade|area|kg|quilos?|toneladas?|litros?|sacos?|ontem|anteontem|hoje)\b/;
const PERGUNTA = /\b(quando|como|qual|quais|quanto|quanta|onde|porque|por que|sera|vai|chover|chuva|tempo|planto|plantar)\b/;
const ehConfirmacao = (t, original = '') =>
  SINAL_CONFIRMA.test(t) && !SINAL_CORRECAO.test(t) && !PERGUNTA.test(t) && !/\?\s*$/.test(original) && t.split(' ').length <= 10;
const CANCELA = /(nao (precisa )?(salva|salvar|anota|anotar)|deixa (pra|para) la|cancela|esquece|descarta|apaga isso|nao quero)/;
const CORRIGE = /^(nao|corrig|errad|na verdade|foi |foram|era |troca|muda|faltou)/;

// Mesmo registro, mesmo com grafias diferentes ("2 toneladas" = "2 t/ha")
function mesmoRegistro(a, b) {
  const qtd = (v) => semAcento(String(v ?? ''))
    .replace(/por hectare|\/ha|por ha/g, '')
    .replace(/toneladas?/g, 't').replace(/quilos?|quilogramas?/g, 'kg').replace(/litros?/g, 'l')
    .replace(/,/g, '.').replace(/\s/g, '');
  const txt = (v) => semAcento(String(v ?? '')).replace(/\s/g, '');
  const chave = (r) => [r.tipo, r.area, r.data, txt(r.produto), qtd(r.quantidade), txt(r.safra), txt(r.cultura)].join('|');
  return chave(a) === chave(b);
}

function cartaoPendente() {
  for (let i = estado.mensagens.length - 1; i >= 0; i--) {
    const m = estado.mensagens[i];
    if (m.registro) return !m.registroEstado || m.registroEstado === 'corrigindo' ? i : null;
    if (m.papel === 'produtor' && i < estado.mensagens.length - 3) return null; // conversa já seguiu
  }
  return null;
}

function respondeuCartao(texto, falada) {
  const indice = cartaoPendente();
  if (indice == null) return false;
  const t = semAcento(texto);
  const m = estado.mensagens[indice];
  const area = ui.ctx.fazenda.lavouras.find((l) => l.id === m.registro.area).nome.toLowerCase();
  let resposta = null;
  let sucesso = false;
  if (CANCELA.test(t)) {
    m.registroEstado = 'descartado';
    estado.corrigindo = null;
    resposta = 'Tudo bem, não anotei.';
  } else if (ehConfirmacao(t, texto)) {
    m.registroEstado = undefined;
    estado.corrigindo = null;
    responderAnotacao(indice, 'salvar');
    resposta = fraseDeSucesso(m.registro, area);
    sucesso = true;
  } else if (CORRIGE.test(t) && m.registroEstado !== 'corrigindo') {
    m.registroEstado = 'corrigindo';
    estado.corrigindo = indice;
    return false; // segue para o Cid entender a correção
  } else {
    return false;
  }
  estado.mensagens.push({ papel: 'cid', texto: resposta, hora: horaAgora(), falada, origem: 'app', sucesso });
  salvar();
  desenharTudo();
  if (falada) tocar(estado.mensagens.length - 1);
  return true;
}

// Confirmação com cara de conversa: varia a frase e diz o que ficou anotado
let ultimaFraseSucesso = -1;
function fraseDeSucesso(r, area) {
  const oque = r.tipo === 'safra'
    ? `${r.safra.toLowerCase()} com ${r.cultura.toLowerCase()}`
    : `${r.quantidade} de ${r.produto.toLowerCase()}`;
  const opcoes = [
    `Anotado! ${maiuscula(oque)} na ${area}.`,
    `Pronto, ficou guardado: ${oque} na ${area}.`,
    `Feito. Já está em Minha roça, na ${area}.`,
    `Guardei aqui: ${oque}. Vou levar isso em conta nas próximas sugestões.`,
    `Certinho, anotei ${oque} na ${area}.`,
  ];
  if (r.tipo === 'safra') opcoes.push(`Anotado. Saber o que já passou por essa terra ajuda a pensar a rotação.`);
  let i;
  do { i = Math.floor(Math.random() * opcoes.length); } while (i === ultimaFraseSucesso && opcoes.length > 1);
  ultimaFraseSucesso = i;
  return opcoes[i];
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
    return `Pra área do milho, depois da colheita de fevereiro, tem três caminhos. ${c1.nome}: preço garantido na cooperativa, mas o outono anda seco. ${c2.nome}: colhe antes da geada e ajuda o solo, mas a venda não é garantida. ${c3.nome}: aguenta melhor a seca e protege a terra. A comparação completa está na aba Plantio.`;
  }
  const soloComparado = s.umidadeSolo - s.umidadeSoloNormal >= 5 ? 'acima do normal' : s.umidadeSolo - s.umidadeSoloNormal <= -5 ? 'abaixo do normal' : 'perto do normal';
  const chuvaComparada = s.chuvaUltimos30Dias > s.chuvaNormal30Dias * 1.2 ? 'acima do normal' : s.chuvaUltimos30Dias < s.chuvaNormal30Dias * 0.8 ? 'abaixo do normal' : 'perto do normal';

  if (/feij/.test(t)) {
    if (forte) return `Vem chuva forte ${nomeDoDia(forte.iso)}, uns ${Math.round(forte.mm)} milímetros. Uma ideia é esperar ela passar e plantar o feijão com a terra úmida, sem enxurrada.`;
    return `A semana deve ter uns ${total} milímetros de chuva, e a umidade do solo está ${soloComparado}. Dá pra plantar quando a terra estiver úmida, sem enxurrada.`;
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
