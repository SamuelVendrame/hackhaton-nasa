// Semeia: carrega os dados, cuida das rotas e dos cliques.

import { getJSON, armazenar } from './util.js';
import { montarCaminhos, fatosDoClima } from './caminhos.js';
import { falar, pararFala } from './voz.js';
import * as telas from './telas.js';
import { telaChat, montarChat, desmontarChat, perguntarDepois, reiniciarConversa } from './cid.js';

const CHAVE_REGISTROS = 'semeia:registros';
const CHAVE_BOAS_VINDAS = 'semeia:viu-boas-vindas';
const ctx = {};
const conteudo = document.getElementById('conteudo');
const abas = document.getElementById('abas');
const fab = document.getElementById('fab');
let avisoLavoura = null;

async function iniciar() {
  const [fazenda, nasa, previsao, status] = await Promise.all([
    getJSON('/data/fazenda.json'),
    getJSON('/data/nasa-cianorte.json'),
    getJSON('/api/previsao').catch(() => getJSON('/data/previsao-reserva.json').then((p) => ({ ...p, origem: 'reserva' }))),
    getJSON('/api/status').catch(() => ({ ia: false })),
  ]);
  Object.assign(ctx, {
    fazenda, nasa, previsao,
    ia: status.ia,
    plano: montarCaminhos(nasa, fazenda),
    fatos: fatosDoClima(nasa),
    registros: armazenar.ler(CHAVE_REGISTROS, {}),
  });
  document.getElementById('carregando').remove();
  document.getElementById('painel-ia').textContent = status.ia
    ? `Cid com IA ligada (${status.modelo}).`
    : 'Cid em modo demonstração (sem chave de IA no servidor).';

  window.addEventListener('hashchange', rotear);
  document.addEventListener('click', aoClicar);
  document.addEventListener('submit', aoEnviar);
  if (!location.hash || location.hash === '#/') {
    history.replaceState(null, '', armazenar.ler(CHAVE_BOAS_VINDAS) ? '#/hoje' : '#/boas-vindas');
  }
  rotear();
}

const ROTAS = {
  'boas-vindas': { tela: () => telas.boasVindas(), cheia: true },
  hoje: { tela: () => telas.hoje(ctx), aba: 'hoje' },
  cid: { tela: () => telaChat(ctx), cheia: true, depois: () => montarChat(ctx) },
  previsao: { tela: (sub) => telas.previsao(ctx, sub), aba: 'previsao', depois: () => telas.montarClima(ctx) },
  plantio: { tela: () => telas.plantio(ctx), aba: 'plantio' },
  roca: { tela: (sub) => (sub ? telas.lavoura(ctx, sub, avisoLavoura) : telas.roca(ctx)), aba: 'roca' },
};

function rotear() {
  const [nome, sub] = location.hash.replace(/^#\/?/, '').split('/');
  const rota = ROTAS[nome] || ROTAS.hoje;
  pararFala();
  desmontarChat();
  telas.falas.clear();
  conteudo.innerHTML = rota.tela(sub);
  conteudo.classList.toggle('cheia', Boolean(rota.cheia));
  abas.hidden = Boolean(rota.cheia);
  fab.hidden = Boolean(rota.cheia);
  fab.classList.toggle('estendido', rota === ROTAS.hoje);
  abas.querySelectorAll('a').forEach((a) => {
    if (a.dataset.aba === rota.aba) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  document.querySelectorAll('.painel-atalhos a').forEach((a) => {
    a.setAttribute('aria-current', String(a.getAttribute('href') === location.hash));
  });
  conteudo.scrollTop = 0;
  rota.depois?.(sub);
  avisoLavoura = null;
}

function aoClicar(e) {
  const ouvir = e.target.closest('[data-ouvir]');
  if (ouvir) {
    const texto = telas.falas.get(ouvir.dataset.ouvir);
    const rotulo = ouvir.querySelector('span');
    if (ouvir.classList.contains('tocando')) {
      pararFala();
      ouvir.classList.remove('tocando');
      if (rotulo) rotulo.textContent = ouvir.dataset.rotulo || 'Ouvir';
      return;
    }
    document.querySelectorAll('[data-ouvir].tocando').forEach((b) => {
      b.classList.remove('tocando');
      const s = b.querySelector('span');
      if (s) s.textContent = b.dataset.rotulo || 'Ouvir';
    });
    ouvir.dataset.rotulo = rotulo?.textContent || 'Ouvir';
    ouvir.classList.add('tocando');
    if (rotulo) rotulo.textContent = 'Parar';
    falar(texto, {
      aoTerminar: () => {
        ouvir.classList.remove('tocando');
        if (rotulo) rotulo.textContent = ouvir.dataset.rotulo;
      },
    });
    return;
  }
  const perguntar = e.target.closest('[data-perguntar]');
  if (perguntar) {
    perguntarDepois(perguntar.dataset.perguntar);
    location.hash = '#/cid';
    return;
  }
  const acao = e.target.closest('[data-acao]')?.dataset.acao;
  if (acao === 'comecar') armazenar.gravar(CHAVE_BOAS_VINDAS, true);
  if (acao === 'reiniciar') {
    armazenar.limpar([CHAVE_REGISTROS, CHAVE_BOAS_VINDAS, 'semeia:conversa']);
    ctx.registros = {};
    reiniciarConversa();
    if (location.hash === '#/boas-vindas') rotear();
    else location.hash = '#/boas-vindas';
  }
}

function aoEnviar(e) {
  const form = e.target.closest('form[data-form]');
  if (!form) return;
  e.preventDefault();
  const id = form.dataset.lavoura;
  const dados = Object.fromEntries(new FormData(form).entries());
  const reg = ctx.registros[id] || { historico: [], aplicacoes: [] };
  if (form.dataset.form === 'historico') {
    reg.historico.unshift({ safra: dados.safra.trim(), cultura: dados.cultura, nota: dados.nota?.trim() || undefined });
    avisoLavoura = `Safra ${dados.safra.trim()} salva. O Cid vai considerar esse histórico.`;
  } else {
    reg.aplicacoes.unshift({ data: dados.data, produto: dados.produto.trim(), qtd: dados.qtd.trim() });
    avisoLavoura = `Aplicação de ${dados.produto.trim()} registrada.`;
  }
  ctx.registros[id] = reg;
  armazenar.gravar(CHAVE_REGISTROS, ctx.registros);
  rotear();
}

iniciar().catch((e) => {
  console.error(e);
  document.getElementById('carregando').textContent = 'Não foi possível carregar o Semeia. Confira se o servidor está rodando (npm start).';
});
