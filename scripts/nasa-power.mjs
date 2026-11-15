// Baixa o histórico diário do NASA POWER para a roça de exemplo (Cianorte, PR)
// e calcula os indicadores climáticos que o Semeia usa.
// Gera public/data/nasa-cianorte.json, que fica no repositório para a demo
// funcionar sem internet.
//
// Uso: npm run dados:nasa

import { writeFile, mkdir } from 'node:fs/promises';

const LOCAL = { nome: 'Cianorte, PR', lat: -23.663, lon: -52.605 };
const PARAMS = ['PRECTOTCORR', 'T2M_MAX', 'T2M_MIN', 'GWETROOT'];
const PERIODO_ANTIGO = [1981, 2000];
const PERIODO_RECENTE = [2006, 2025];

const ontem = new Date(Date.now() - 86400000).toISOString().slice(0, 10).replaceAll('-', '');
const url = new URL('https://power.larc.nasa.gov/api/temporal/daily/point');
url.search = new URLSearchParams({
  parameters: PARAMS.join(','),
  community: 'AG',
  latitude: LOCAL.lat,
  longitude: LOCAL.lon,
  start: '19810101',
  end: ontem,
  format: 'JSON',
});

console.log('Baixando', url.href);
const resp = await fetch(url);
if (!resp.ok) throw new Error(`NASA POWER respondeu ${resp.status}`);
const p = (await resp.json()).properties.parameter;

// -999 marca dia sem dado
const dias = Object.keys(p.PRECTOTCORR)
  .sort()
  .map((k) => ({
    ano: +k.slice(0, 4),
    mes: +k.slice(4, 6),
    md: k.slice(4),
    iso: `${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6)}`,
    chuva: p.PRECTOTCORR[k],
    tmax: p.T2M_MAX[k],
    tmin: p.T2M_MIN[k],
    solo: p.GWETROOT[k],
  }))
  .filter((d) => d.chuva > -999 && d.tmax > -999 && d.tmin > -999 && d.solo > -999);

const anosDe = ([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const media = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
const soma = (xs, f) => xs.reduce((s, d) => s + f(d), 0);
const r1 = (x) => Math.round(x * 10) / 10;
const porAno = new Map();
for (const d of dias) {
  if (!porAno.has(d.ano)) porAno.set(d.ano, []);
  porAno.get(d.ano).push(d);
}

function maiorSequenciaSeca(lista) {
  let melhor = 0, atual = 0;
  for (const d of lista) {
    atual = d.chuva < 1 ? atual + 1 : 0;
    melhor = Math.max(melhor, atual);
  }
  return melhor;
}

function resumo(periodo) {
  const anos = anosDe(periodo);
  const linhas = anos.map((a) => {
    const ds = porAno.get(a);
    return {
      chuvaAno: soma(ds, (d) => d.chuva),
      chuvaAbrMai: soma(ds.filter((d) => d.mes === 4 || d.mes === 5), (d) => d.chuva),
      diasCalor: ds.filter((d) => d.tmax >= 35).length,
      veranicoOutono: maiorSequenciaSeca(ds.filter((d) => d.mes >= 3 && d.mes <= 5)),
      // janela da segunda safra: semeadura no fim de fevereiro, colheita em junho
      chuvaSafrinha: soma(ds.filter((d) => d.md >= '0220' && d.md <= '0630'), (d) => d.chuva),
      geadaSafrinha: ds.some((d) => d.md >= '0515' && d.md <= '0731' && d.tmin <= 3),
      geadaCedo: ds.some((d) => d.md >= '0501' && d.md <= '0531' && d.tmin <= 3),
    };
  });
  const pct = (f) => Math.round((100 * linhas.filter(f).length) / linhas.length);
  return {
    anos: periodo,
    chuvaMensal: Array.from({ length: 12 }, (_, i) =>
      Math.round(media(anos.map((a) => soma(porAno.get(a).filter((d) => d.mes === i + 1), (d) => d.chuva))))
    ),
    chuvaAnual: Math.round(media(linhas.map((l) => l.chuvaAno))),
    chuvaAbrMai: Math.round(media(linhas.map((l) => l.chuvaAbrMai))),
    diasCalorAno: r1(media(linhas.map((l) => l.diasCalor))),
    veranicoOutonoMedio: r1(media(linhas.map((l) => l.veranicoOutono))),
    anosComVeranico15: linhas.filter((l) => l.veranicoOutono >= 15).length,
    chuvaJanelaSafrinha: Math.round(media(linhas.map((l) => l.chuvaSafrinha))),
    chuvaJanelaSafrinhaMin: Math.round(Math.min(...linhas.map((l) => l.chuvaSafrinha))),
    pctAnosGeadaSafrinha: pct((l) => l.geadaSafrinha),
    pctAnosGeadaMaio: pct((l) => l.geadaCedo),
    totalAnos: linhas.length,
  };
}

const antigo = resumo(PERIODO_ANTIGO);
const recente = resumo(PERIODO_RECENTE);
const diasCalorPorAno = anosDe([PERIODO_ANTIGO[0], PERIODO_RECENTE[1]]).map((a) => ({
  ano: a,
  dias: porAno.get(a).filter((d) => d.tmax >= 35).length,
}));

// Situação atual: chuva dos últimos 30 dias e umidade do solo comparadas ao normal recente
const ultimo = dias.at(-1);
const ult30 = dias.slice(-30);
const mds = new Set(ult30.map((d) => d.md));
const anosRecentes = anosDe(PERIODO_RECENTE);
const normal30 = media(anosRecentes.map((a) => soma(porAno.get(a).filter((d) => mds.has(d.md)), (d) => d.chuva)));
const normalSolo = media(anosRecentes.map((a) => porAno.get(a).find((d) => d.md === ultimo.md)?.solo).filter((x) => x != null));

const saida = {
  fonte: {
    nome: 'NASA POWER, comunidade Agroclimatologia',
    url: 'https://power.larc.nasa.gov/',
    parametros: {
      PRECTOTCORR: 'chuva (mm/dia)',
      T2M_MAX: 'temperatura máxima a 2 m (°C)',
      T2M_MIN: 'temperatura mínima a 2 m (°C)',
      GWETROOT: 'umidade do solo na zona das raízes (0 a 1)',
    },
    observacao: 'Dados em grade de satélite e reanálise para a região, não de estação na propriedade.',
    geradoEm: new Date().toISOString(),
    ultimoDia: ultimo.iso,
  },
  local: LOCAL,
  periodos: { antigo, recente },
  diasCalorPorAno,
  diasCalorUltimos5Anos: r1(media(diasCalorPorAno.slice(-5).map((x) => x.dias))),
  situacaoAtual: {
    data: ultimo.iso,
    chuvaUltimos30Dias: Math.round(soma(ult30, (d) => d.chuva)),
    chuvaNormal30Dias: Math.round(normal30),
    umidadeSolo: Math.round(ultimo.solo * 100),
    umidadeSoloNormal: Math.round(normalSolo * 100),
  },
};

await mkdir(new URL('../public/data/', import.meta.url), { recursive: true });
await writeFile(new URL('../public/data/nasa-cianorte.json', import.meta.url), JSON.stringify(saida, null, 1) + '\n');
console.log(`OK: ${dias.length} dias, até ${ultimo.iso}`);
console.log('1981-2000', antigo);
console.log('2006-2025', recente);
console.log('Agora', saida.situacaoAtual, '| dias de calor, média 2021-2025:', saida.diasCalorUltimos5Anos);
