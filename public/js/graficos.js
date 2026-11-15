// Gráficos de colunas em SVG, sem biblioteca.
// Barras finas com topo arredondado, grade discreta, dica ao passar o mouse
// ou focar pelo teclado, e tabela com os mesmos valores (montada em telas.js).

import { esc } from './util.js';

const L = 340, A = 206;
const M = { e: 34, d: 6, t: 24, b: 24 };
const LP = L - M.e - M.d;
const AP = A - M.t - M.b;

function escalaLimpa(max) {
  const passos = [5, 10, 20, 25, 50, 100, 200, 250, 500];
  const passo = passos.find((p) => max / p <= 4) || 1000;
  return { passo, topo: Math.ceil(max / passo) * passo };
}

function barra(x, y, w, h) {
  if (h <= 0) return '';
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

function grade(topo, passo, unidade) {
  let s = '';
  for (let v = 0; v <= topo; v += passo) {
    const y = M.t + AP - (v / topo) * AP;
    s += `<line x1="${M.e}" x2="${L - M.d}" y1="${y}" y2="${y}" stroke="${v === 0 ? '#C3C2B7' : '#ECE6C2'}" stroke-width="1"/>`;
    s += `<text x="${M.e - 6}" y="${y + 4}" text-anchor="end" font-size="11" fill="#5E6E62" style="font-variant-numeric:tabular-nums">${v}</text>`;
  }
  s += `<text x="${M.e - 6}" y="${M.t - 12}" text-anchor="end" font-size="10" fill="#5E6E62">${esc(unidade)}</text>`;
  return s;
}

function ligarDica(el, alvos) {
  const dica = document.createElement('div');
  dica.className = 'dica';
  dica.hidden = true;
  el.appendChild(dica);
  const svg = el.querySelector('svg');
  const mostrar = (alvo) => {
    const dados = alvos[Number(alvo.dataset.i)];
    const k = svg.clientWidth / L;
    dica.replaceChildren();
    const titulo = document.createElement('div');
    titulo.textContent = dados.titulo;
    dica.appendChild(titulo);
    for (const linha of dados.linhas) {
      const div = document.createElement('div');
      const chave = document.createElement('span');
      chave.className = 'chave';
      chave.style.background = linha.cor;
      const valor = document.createElement('strong');
      valor.textContent = linha.valor;
      div.append(chave, valor, document.createTextNode(` ${linha.nome}`));
      dica.appendChild(div);
    }
    const x = Math.min(Math.max(dados.x * k, 70), svg.clientWidth - 70);
    dica.style.left = `${x}px`;
    dica.style.top = `${dados.y * k}px`;
    dica.hidden = false;
  };
  const esconder = () => { dica.hidden = true; };
  el.querySelectorAll('.alvo').forEach((a) => {
    a.addEventListener('pointerenter', () => mostrar(a));
    a.addEventListener('focus', () => mostrar(a));
    a.addEventListener('pointerleave', esconder);
    a.addEventListener('blur', esconder);
  });
}

// Duas séries lado a lado por categoria (ex.: chuva por mês em dois períodos)
export function colunasAgrupadas(el, { categorias, series, unidade, rotuloAria }) {
  const max = Math.max(...series.flatMap((s) => s.valores));
  const { passo, topo } = escalaLimpa(max);
  const faixa = LP / categorias.length;
  const lb = Math.min(24, (faixa * 0.8 - 2) / series.length);
  const yDe = (v) => M.t + AP - (v / topo) * AP;
  let corpo = grade(topo, passo, unidade);
  const alvos = [];
  categorias.forEach((cat, i) => {
    const x0 = M.e + i * faixa + (faixa - (lb * series.length + 2 * (series.length - 1))) / 2;
    let barras = '';
    series.forEach((s, j) => {
      const v = s.valores[i];
      barras += `<path d="${barra(x0 + j * (lb + 2), yDe(v), lb, M.t + AP - yDe(v))}" fill="${s.cor}"/>`;
    });
    const topoGrupo = Math.min(...series.map((s) => yDe(s.valores[i])));
    alvos.push({
      x: M.e + i * faixa + faixa / 2,
      y: topoGrupo,
      titulo: cat,
      linhas: series.map((s) => ({ cor: s.cor, valor: `${s.valores[i]} ${unidade}`, nome: s.nome })),
    });
    const aria = `${cat}: ${series.map((s) => `${s.nome} ${s.valores[i]} ${unidade}`).join(', ')}`;
    corpo += `<g><rect class="realce" x="${M.e + i * faixa}" y="${M.t}" width="${faixa}" height="${AP}" fill="#F3EDC9"/>${barras}<rect class="alvo" data-i="${i}" tabindex="0" role="img" aria-label="${esc(aria)}" x="${M.e + i * faixa}" y="${M.t}" width="${faixa}" height="${AP}" fill="transparent"/></g>`;
    corpo += `<text x="${M.e + i * faixa + faixa / 2}" y="${A - 8}" text-anchor="middle" font-size="11" fill="#5E6E62">${esc(cat)}</text>`;
  });
  el.innerHTML = `<svg viewBox="0 0 ${L} ${A}" role="group" aria-label="${esc(rotuloAria)}">${corpo}</svg>`;
  ligarDica(el, alvos);
}

// Uma coluna por item, cor definida por item (ex.: dias de calor por ano, cor por período)
export function colunasSimples(el, { itens, unidade, rotuloAria, marcos = [], destaque }) {
  const max = Math.max(...itens.map((i) => i.valor));
  const { passo, topo } = escalaLimpa(max);
  const faixa = LP / itens.length;
  const lb = Math.min(24, faixa - 2);
  const yDe = (v) => M.t + AP - (v / topo) * AP;
  let corpo = grade(topo, passo, unidade);
  const alvos = [];
  itens.forEach((it, i) => {
    const x = M.e + i * faixa + (faixa - lb) / 2;
    alvos.push({ x: x + lb / 2, y: yDe(it.valor), titulo: it.rotulo, linhas: [{ cor: it.cor, valor: `${it.valor} ${unidade}`, nome: it.nomeSerie }] });
    corpo += `<g><rect class="realce" x="${M.e + i * faixa}" y="${M.t}" width="${faixa}" height="${AP}" fill="#F3EDC9"/><path d="${barra(x, yDe(it.valor), lb, M.t + AP - yDe(it.valor))}" fill="${it.cor}"/><rect class="alvo" data-i="${i}" x="${M.e + i * faixa}" y="${M.t}" width="${faixa}" height="${AP}" fill="transparent"/></g>`;
    if (marcos.includes(it.rotulo)) {
      corpo += `<text x="${x + lb / 2}" y="${A - 8}" text-anchor="middle" font-size="11" fill="#5E6E62">${esc(it.rotulo)}</text>`;
    }
    if (destaque === it.rotulo) {
      corpo += `<text x="${x + lb / 2}" y="${yDe(it.valor) - 5}" text-anchor="end" font-size="11" font-weight="800" fill="#14361F">${it.valor} em ${esc(it.rotulo)}</text>`;
    }
  });
  el.innerHTML = `<svg viewBox="0 0 ${L} ${A}" role="img" aria-label="${esc(rotuloAria)}">${corpo}</svg>`;
  ligarDica(el, alvos);
}
