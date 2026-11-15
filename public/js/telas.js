// Telas do Semeia. Cada função devolve o HTML da tela; `falas` guarda os textos
// que os botões "Ouvir" leem em voz alta.

import {
  esc, ICONES, DIAS_CURTOS, MESES, dataLocal, fmtData, fmtDataCurta, hojeISO, nomeDoDia,
  diasEntre, saudacao, iconeDoTempo,
} from './util.js';
import { NIVEIS } from './caminhos.js';
import { colunasAgrupadas, colunasSimples } from './graficos.js';

export const falas = new Map();

const voltar = (href, texto) => `<a class="voltar" href="${href}">${ICONES.voltar}${esc(texto)}</a>`;
const botaoOuvir = (chave, rotulo = 'Ouvir', claro = false) =>
  `<button type="button" class="botao-ouvir${claro ? ' claro' : ''}" data-ouvir="${esc(chave)}" aria-label="${esc(rotulo)} em voz alta">${ICONES.play}<span>${esc(rotulo)}</span></button>`;

function diasDaPrevisao(previsao) {
  const d = previsao.daily;
  return d.time.map((iso, i) => ({
    iso,
    mm: Math.round(d.precipitation_sum[i] * 10) / 10,
    chance: d.precipitation_probability_max[i] ?? 0,
    max: Math.round(d.temperature_2m_max[i]),
    min: Math.round(d.temperature_2m_min[i]),
    vento: Math.round(d.wind_speed_10m_max[i]),
  }));
}

function proximosDias(ctx) {
  const hoje = hojeISO();
  const dias = diasDaPrevisao(ctx.previsao);
  const desde = dias.findIndex((d) => d.iso >= hoje);
  return desde === -1 ? dias : dias.slice(desde);
}

function estadoDoSolo(nasa) {
  const s = nasa.situacaoAtual;
  const dif = s.umidadeSolo - s.umidadeSoloNormal;
  if (dif >= 5) return { curto: 'Úmido', longo: 'Acima do normal da época', classe: 'azul' };
  if (dif <= -5) return { curto: 'Seco', longo: 'Abaixo do normal da época', classe: 'aviso' };
  return { curto: 'Normal', longo: 'Normal para a época', classe: '' };
}

export function ideiaDoDia(ctx) {
  const dias = proximosDias(ctx).slice(0, 7);
  const forte = dias.find((d) => d.mm >= 10);
  const total = Math.round(dias.reduce((s, d) => s + d.mm, 0));
  if (forte) {
    return `Chuva forte prevista pra ${nomeDoDia(forte.iso)}, uns ${Math.round(forte.mm)} milímetros. Se for plantar o feijão, uma ideia é esperar ela passar. A decisão é sua.`;
  }
  if (total < 5 && Math.max(...dias.map((d) => d.max)) >= 32) {
    return 'Semana seca e quente. Se for irrigar o milho, uma ideia é fazer isso no fim da tarde, quando evapora menos.';
  }
  return `A semana deve ter uns ${total} milímetros de chuva, sem temporal. Bom momento pra pensar no que plantar depois do milho.`;
}

// ---------- Boas-vindas ----------
export function boasVindas() {
  return `
<div class="boas-vindas">
  <div class="bv-topo">
    <img src="/img/icone.svg" alt="Ícone do Semeia">
    <h1>Semeia</h1>
    <p>do satélite pro seu plantio</p>
  </div>
  <div class="bv-corpo">
    <p>O tempo mudou e o calendário de plantio também. O Semeia acompanha o clima da sua roça com dados de satélite da NASA, e o <strong>Cid</strong> te explica tudo falando.</p>
    <div class="passo"><b>1</b>Conte o que você planta</div>
    <div class="passo"><b>2</b>Marque onde fica a sua roça</div>
    <div class="passo"><b>3</b>Pergunte ao Cid por áudio</div>
  </div>
  <div class="bv-acoes">
    <a class="botao amarelo grande" href="#/hoje" data-acao="comecar">Começar</a>
  </div>
</div>`;
}

// ---------- Hoje ----------
export function hoje(ctx) {
  const { fazenda, nasa } = ctx;
  const d = proximosDias(ctx)[0];
  const tempo = iconeDoTempo(d.mm, d.chance);
  const solo = estadoDoSolo(nasa);
  const ideia = ideiaDoDia(ctx);
  falas.set('ideia', ideia);
  const lav = fazenda.lavouras;
  return `
<div class="pagina">
  <div class="saudacao">
    <div class="cabeca">
      <h1>${saudacao()}, ${esc(fazenda.produtor.nome)}</h1>
      <p>${esc(fazenda.propriedade.nome)} · ${esc(fazenda.propriedade.municipio)}, ${esc(fazenda.propriedade.uf)}</p>
    </div>
    <img src="/img/icone.svg" alt="">
  </div>

  <section class="tempo-hoje" aria-label="Tempo hoje">
    <div class="linha-titulo">
      <div class="cabeca">
        <span class="rotulo">Hoje · ${fmtData(d.iso)}</span>
        <span class="temp">${d.max}°</span>
        <span class="desc">${tempo.texto} · mínima ${d.min}°</span>
      </div>
      <span style="transform:scale(2.6);transform-origin:right center;margin-right:8px">${tempo.icone}</span>
    </div>
    <div class="mini-grade">
      <div><span>Chuva</span><strong>${d.chance}%</strong></div>
      <div><span>Solo (NASA)</span><strong>${solo.curto}</strong></div>
      <div><span>Vento</span><strong>${d.vento} km/h</strong></div>
    </div>
  </section>

  <section class="ideia" aria-label="Ideia do Cid">
    <span class="ideia-rotulo">${ICONES.lampada}Ideia do Cid</span>
    <p>${esc(ideia)}</p>
    <div class="linha-botoes">
      ${botaoOuvir('ideia')}
      <a class="botao pequeno contorno" href="#/previsao">Ver previsão</a>
    </div>
  </section>

  <a class="plantio-destaque" href="#/plantio">
    <div style="flex:1">
      <strong>O milho sai em fevereiro. E depois?</strong>
      <span>3 caminhos para a área, com o clima da sua roça medido por satélite</span>
    </div>
    ${ICONES.seta}
  </a>

  <section aria-label="Suas lavouras" class="cabeca" style="gap:8px">
    <div class="linha-titulo"><h2 class="secao-titulo">Suas lavouras</h2><a href="#/roca" style="font-weight:800;text-decoration:none;min-height:44px;display:flex;align-items:center">Ver tudo</a></div>
    <div class="lavouras-mini">
      ${lav.map((l) => `<a href="#/roca/${esc(l.id)}"><strong>${esc(l.cultura)}</strong><span>${esc(l.status)}${l.plantio ? ` · ${Math.round(diasEntre(l.plantio, hojeISO()) / 7)} semanas` : ''}</span></a>`).join('')}
    </div>
  </section>
</div>`;
}

// ---------- Previsão ----------
export function previsao(ctx, aba) {
  const seletor = `
  <nav class="seletor" aria-label="Período">
    <a href="#/previsao" ${aba !== 'clima' ? 'aria-current="page"' : ''}>Próximos dias</a>
    <a href="#/previsao/clima" ${aba === 'clima' ? 'aria-current="page"' : ''}>Clima da roça</a>
  </nav>`;
  const cab = `<div class="cabeca"><h1>Previsão</h1><p>${esc(ctx.fazenda.propriedade.nome)} · ${esc(ctx.fazenda.propriedade.regiao)}</p></div>`;
  return `<div class="pagina">${cab}${seletor}${aba === 'clima' ? climaDaRoca(ctx) : proximosDiasHTML(ctx)}</div>`;
}

function proximosDiasHTML(ctx) {
  const { nasa, previsao } = ctx;
  const s = nasa.situacaoAtual;
  const solo = estadoDoSolo(nasa);
  const dias = proximosDias(ctx).slice(0, 14);
  const maxMm = Math.max(20, ...dias.map((d) => d.mm));
  const hoje = hojeISO();
  return `
  <section class="cartao" aria-label="Umidade do solo">
    <div class="linha-titulo"><h2>Umidade do solo</h2><span class="pilula ${solo.classe}">${solo.longo}</span></div>
    <div class="fato-valores"><span class="fato-agora">${s.umidadeSolo}</span><span class="fato-antes">de 100 agora · normal da época: ${s.umidadeSoloNormal}</span></div>
    <div class="escala" role="img" aria-label="Umidade do solo ${s.umidadeSolo} de 100; normal da época ${s.umidadeSoloNormal}">
      <div class="escala-faixa"></div>
      <div class="escala-normal" style="left:${s.umidadeSoloNormal}%"></div>
      <div class="escala-marca" style="left:${s.umidadeSolo}%"></div>
    </div>
    <div class="escala-legenda"><span>Seco</span><span>Úmido</span><span>Encharcado</span></div>
    <p class="fonte">Satélite NASA (POWER, zona das raízes), dado de ${fmtData(s.data)}. Últimos 30 dias: ${s.chuvaUltimos30Dias} mm de chuva (normal ${s.chuvaNormal30Dias} mm).</p>
  </section>

  <section class="cartao dias" aria-label="Previsão dos próximos dias">
    <div class="dia-cab" aria-hidden="true"><span>Dia</span><span></span><span>Chuva</span><span style="text-align:center">Chance</span><span style="text-align:right">Máx/Mín</span></div>
    ${dias.map((d) => {
      const t = iconeDoTempo(d.mm, d.chance);
      const dt = dataLocal(d.iso);
      const nome = d.iso === hoje ? 'Hoje' : DIAS_CURTOS[dt.getDay()];
      return `<div class="dia" role="group" aria-label="${esc(`${nomeDoDia(d.iso)} ${fmtData(d.iso)}: ${t.texto}, ${d.mm} milímetros, chance ${d.chance}%, máxima ${d.max}, mínima ${d.min}`)}">
        <span class="dia-nome">${nome}<small>${dt.getDate()} ${MESES[dt.getMonth()]}</small></span>
        ${t.icone}
        <span class="chuva-barra"><span class="trilho"><span class="cheio" style="width:${Math.round((d.mm / maxMm) * 100)}%"></span></span><span>${d.mm} mm</span></span>
        <span class="dia-chance">${d.chance}%</span>
        <span class="dia-temp"><strong>${d.max}°</strong> <span>${d.min}°</span></span>
      </div>`;
    }).join('')}
  </section>
  <p class="fonte">Previsão: Open-Meteo${previsao.origem === 'reserva' ? `, cópia salva (sem internet agora)` : ', atualizada a cada 30 minutos'}. Tendência, não certeza.</p>`;
}

function climaDaRoca(ctx) {
  const { nasa, fatos } = ctx;
  const a = nasa.periodos.antigo;
  const r = nasa.periodos.recente;
  return `
  <span class="selo-nasa">Satélite NASA · ${a.anos[0]} a ${r.anos[1]}</span>
  <p class="sub" style="color:var(--texto-2)">Comparamos os 20 anos de ${a.anos.join(' a ')} com os 20 mais recentes, de ${r.anos.join(' a ')}, para a sua região.</p>
  <div class="fatos">
    ${fatos.map((f) => `<div class="fato"><span class="fato-titulo">${esc(f.titulo)}</span><div class="fato-valores"><span class="fato-agora">${esc(f.agora)}</span><span class="fato-antes">antes: ${esc(f.antes)}${f.variacao ? ` · ${esc(f.variacao)}` : ''}</span></div></div>`).join('')}
    <div class="fato"><span class="fato-titulo">Geada entre 15 de maio e julho</span><div class="fato-valores"><span class="fato-agora">${r.pctAnosGeadaSafrinha}% dos anos</span><span class="fato-antes">antes: ${a.pctAnosGeadaSafrinha}%</span></div></div>
  </div>

  <section class="cartao" aria-label="Chuva média por mês">
    <h2>Chuva média por mês</h2>
    <div class="legenda"><span><i style="background:var(--serie-1)"></i>${a.anos.join('–')}</span><span><i style="background:var(--serie-2)"></i>${r.anos.join('–')}</span></div>
    <div class="grafico" id="grafico-chuva"></div>
    <details class="tabela"><summary>Ver em tabela</summary>
      <table><thead><tr><th>Mês</th><th>${a.anos.join('–')}</th><th>${r.anos.join('–')}</th></tr></thead>
      <tbody>${MESES.map((m, i) => `<tr><td>${m}</td><td>${a.chuvaMensal[i]} mm</td><td>${r.chuvaMensal[i]} mm</td></tr>`).join('')}</tbody></table>
    </details>
  </section>

  <section class="cartao" aria-label="Dias acima de 35 graus por ano">
    <h2>Dias acima de 35 °C por ano</h2>
    <div class="legenda"><span><i style="background:var(--serie-1)"></i>${a.anos.join('–')}</span><span><i style="background:var(--serie-neutra)"></i>2001–2005</span><span><i style="background:var(--serie-2)"></i>${r.anos.join('–')}</span></div>
    <div class="grafico" id="grafico-calor"></div>
    <details class="tabela"><summary>Ver em tabela</summary>
      <table><thead><tr><th>Ano</th><th>Dias ≥ 35 °C</th></tr></thead>
      <tbody>${nasa.diasCalorPorAno.map((x) => `<tr><td>${x.ano}</td><td>${x.dias}</td></tr>`).join('')}</tbody></table>
    </details>
  </section>
  <p class="fonte">Fonte: ${esc(nasa.fonte.nome)} (power.larc.nasa.gov), dados diários até ${fmtDataCurta(nasa.fonte.ultimoDia)}. ${esc(nasa.fonte.observacao)}</p>`;
}

export function montarClima(ctx) {
  const { nasa } = ctx;
  const a = nasa.periodos.antigo;
  const r = nasa.periodos.recente;
  const elChuva = document.getElementById('grafico-chuva');
  if (elChuva) {
    colunasAgrupadas(elChuva, {
      categorias: MESES,
      series: [
        { nome: a.anos.join('–'), cor: '#2a78d6', valores: a.chuvaMensal },
        { nome: r.anos.join('–'), cor: '#eb6834', valores: r.chuvaMensal },
      ],
      unidade: 'mm',
      rotuloAria: 'Chuva média por mês nos dois períodos',
    });
  }
  const elCalor = document.getElementById('grafico-calor');
  if (elCalor) {
    const maior = nasa.diasCalorPorAno.reduce((m, x) => (x.dias > m.dias ? x : m));
    colunasSimples(elCalor, {
      itens: nasa.diasCalorPorAno.map((x) => ({
        rotulo: String(x.ano),
        valor: x.dias,
        cor: x.ano <= a.anos[1] ? '#2a78d6' : x.ano >= r.anos[0] ? '#eb6834' : '#B8B6AC',
        nomeSerie: 'dias acima de 35 °C',
      })),
      unidade: 'dias',
      rotuloAria: `Dias acima de 35 graus por ano, de ${a.anos[0]} a ${r.anos[1]}. Média de ${Math.round(a.diasCalorAno)} dias em ${a.anos.join(' a ')} e ${Math.round(r.diasCalorAno)} em ${r.anos.join(' a ')}.`,
      marcos: ['1981', '1990', '2000', '2010', '2025'],
      destaque: String(maior.ano),
    });
  }
}

// ---------- Plantio ----------
export function plantio(ctx) {
  const { plano, fatos } = ctx;
  falas.set('resumo-plantio', [
    'Para a área do milho, depois da colheita de fevereiro, separei três caminhos.',
    fatos[0].texto,
    ...plano.caminhos.map((c, i) => `Caminho ${i + 1}, ${c.nome}. ${c.fala}`),
    'Quem decide é o senhor. Vale confirmar com o agrônomo ou a cooperativa.',
  ].join(' '));
  return `
<div class="pagina">
  <div class="cabeca"><h1>Próximo plantio</h1><p>${esc(plano.subtitulo)}</p></div>

  <section class="janela" aria-label="Resumo">
    <strong>${esc(plano.titulo)}?</strong>
    <p>Comparamos 3 caminhos com 45 anos de clima da sua região medido por satélite (NASA) e com a sua realidade: solo, histórico da área e contrato da cooperativa. ${esc(plano.janela)}.</p>
    <div class="linha-botoes">${botaoOuvir('resumo-plantio', 'Ouvir resumo').replace('botao-ouvir', 'botao-ouvir ouvindo')}</div>
  </section>

  <section class="cartao" aria-label="O que mudou no clima">
    <div class="linha-titulo"><h2>O que mudou no outono</h2><a href="#/previsao/clima" style="font-weight:800;font-size:14px">Ver gráficos</a></div>
    <ul style="margin:0;padding-left:20px;display:flex;flex-direction:column;gap:6px;font-size:15px;line-height:1.45;color:var(--texto-2)">
      ${fatos.map((f) => `<li>${esc(f.texto)}</li>`).join('')}
    </ul>
    <span class="selo-nasa">Satélite NASA · POWER</span>
  </section>

  ${plano.caminhos.map((c, i) => caminhoHTML(c, i)).join('')}

  <p class="nota-decisao"><strong>Quem decide é você.</strong> O Semeia mostra os dados e os riscos de cada caminho. Antes de fechar, confirme com o agrônomo ou a cooperativa. As regras de recomendação desta demonstração ainda não foram validadas por um agrônomo, e preços e propriedade são de exemplo.</p>
</div>`;
}

function caminhoHTML(c, i) {
  falas.set(`caminho-${c.id}`, `Caminho ${i + 1}: ${c.nome}. ${c.fala}`);
  const lista = (titulo, itens) => `<h3>${titulo}</h3><ul>${itens.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
  return `
  <article class="caminho${i === 0 ? ' atual' : ''}" aria-labelledby="caminho-${esc(c.id)}">
    <div class="caminho-topo">
      <span class="caminho-num" aria-hidden="true">${i + 1}</span>
      <div class="cabeca" style="gap:4px">
        <span class="pilula ${i === 0 ? 'aviso' : ''}">${esc(c.etiqueta)}</span>
        <h2 id="caminho-${esc(c.id)}">${esc(c.nome)}</h2>
      </div>
    </div>
    <p class="porque">${esc(c.porque)}</p>
    <ul class="criterios">
      ${c.criterios.map((k) => `
      <li class="criterio">
        <div class="criterio-cab"><span class="criterio-nome">${esc(k.nome)}</span><span class="nivel ${k.nivel}">${ICONES[k.nivel]}${NIVEIS[k.nivel].rotulo}</span></div>
        <p>${esc(k.texto)}</p>
      </li>`).join('')}
    </ul>
    <details>
      <summary>Benefícios, riscos e o que falta saber</summary>
      ${lista('Benefícios', c.beneficios)}${lista('Riscos', c.riscos)}${lista('O que falta saber', c.lacunas)}
    </details>
    <div class="linha-botoes">
      ${botaoOuvir(`caminho-${c.id}`)}
      <button type="button" class="botao pequeno contorno" data-perguntar="${esc(`Me explica melhor o caminho do ${c.nome.toLowerCase()}. Quais os riscos pra minha roça?`)}">Perguntar ao Cid</button>
    </div>
  </article>`;
}

// ---------- Minha roça ----------
export function roca(ctx) {
  const { fazenda } = ctx;
  const p = fazenda.propriedade;
  return `
<div class="pagina">
  <div class="cabeca"><h1>Minha roça</h1><p>${esc(p.nome)} · ${p.hectares} hectares · ${esc(p.municipio)}, ${esc(p.uf)}</p></div>
  <div class="mapa">
    <svg viewBox="0 0 350 190" role="img" aria-label="Mapa da propriedade com duas áreas: milho e feijão">
      <rect width="350" height="190" fill="#E9E4C3"/>
      <path d="M0 150 C80 130 140 170 220 150 C280 136 320 150 350 140 V190 H0 Z" fill="#CFE0EA"/>
      <path d="M24 22 L180 14 L192 118 L36 132 Z" fill="#7FB37A"/>
      <path d="M24 22 L180 14 M28 46 L183 38 M30 70 L186 62 M32 94 L189 86 M34 118 L191 110" stroke="#5E9A5A" stroke-width="2"/>
      <path d="M200 18 L326 26 L318 120 L208 116 Z" fill="#E3C873"/>
      <path d="M200 18 L326 26 L318 120 L208 116 Z" fill="none" stroke="#C9A94A" stroke-width="2" stroke-dasharray="6 5"/>
      <rect x="72" y="58" width="72" height="28" rx="14" fill="#FFFFFF"/>
      <text x="108" y="77" text-anchor="middle" font-family="Nunito, sans-serif" font-size="14" font-weight="900" fill="#14361F">Milho</text>
      <rect x="225" y="56" width="76" height="28" rx="14" fill="#FFFFFF"/>
      <text x="263" y="75" text-anchor="middle" font-family="Nunito, sans-serif" font-size="14" font-weight="900" fill="#14361F">Feijão</text>
      <circle cx="196" cy="150" r="9" fill="#FFC21A" stroke="#14361F" stroke-width="2.5"/>
    </svg>
    <a href="#/roca/milho" aria-label="Abrir área do milho" style="left:7%;top:7%;width:48%;height:62%"></a>
    <a href="#/roca/feijao" aria-label="Abrir área do feijão" style="left:57%;top:9%;width:36%;height:54%"></a>
  </div>

  ${fazenda.lavouras.map((l) => lavouraCartao(l)).join('')}

  <section class="cartao" aria-label="Solo">
    <div class="linha-titulo"><h2>Solo</h2><span class="pilula aviso">Análise de ${fmtData(p.solo.analise.data)} ${p.solo.analise.data.slice(0, 4)}</span></div>
    <p style="margin:0;font-size:15px;line-height:1.45;color:var(--texto-2)"><strong>${esc(p.solo.tipo)}.</strong> ${esc(p.solo.resumo)}</p>
    <div class="dupla">
      <div class="info"><span class="rot">pH</span><strong>${String(p.solo.analise.ph).replace('.', ',')}</strong></div>
      <div class="info"><span class="rot">Matéria orgânica</span><strong>${String(p.solo.analise.materiaOrganica).replace('.', ',')}%</strong></div>
    </div>
  </section>
  <p class="fonte">${esc(fazenda.aviso)}</p>
</div>`;
}

function lavouraCartao(l) {
  const hoje = hojeISO();
  let progresso = '';
  if (l.plantio && l.colheitaPrevista) {
    const pct = Math.max(0, Math.min(100, Math.round((100 * diasEntre(l.plantio, hoje)) / diasEntre(l.plantio, l.colheitaPrevista))));
    progresso = `<div class="progresso" role="img" aria-label="Ciclo ${pct}% concluído"><div style="width:${pct}%"></div></div>
      <div class="progresso-legenda"><span>Plantio ${fmtData(l.plantio)}</span><span>Colheita prevista: ${fmtData(l.colheitaPrevista)}</span></div>`;
  }
  return `
  <a class="lavoura" href="#/roca/${esc(l.id)}">
    <div class="lavoura-topo">
      <span class="lavoura-icone">${iconeCultura(l.cultura)}</span>
      <div style="flex:1;min-width:0">
        <strong>${esc(l.nome)}</strong>
        <span class="sub">${l.hectares} ha · ${esc(l.cultura)}${l.plantio ? ` · plantado em ${fmtData(l.plantio)}` : ' · ainda não plantado'}</span>
      </div>
      ${ICONES.seta}
    </div>
    <span class="pilula ${l.plantio ? '' : 'aviso'}">${esc(l.status)}</span>
    ${progresso}
  </a>`;
}

function iconeCultura(cultura) {
  if (cultura === 'Feijão') {
    return '<svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 8 C8.5 3.5 16 3.5 17.8 9 C19.5 14.5 15 19.5 10.5 18.5 C7 17.8 8 14.5 9.5 13.2 C11 12 5 11.5 6.5 8 Z" fill="#8B4A2B"/></svg>';
  }
  return '<svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="13.5" cy="9.5" rx="4" ry="7" transform="rotate(30 13.5 9.5)" fill="#FFC21A"/><path d="M10 7.5 L16.5 11.5 M11.5 4.8 L17.5 8.3 M9 10.5 L14.5 13.8" stroke="#E0A800" stroke-width="1.2" stroke-linecap="round"/><path d="M4.5 21 C7 15 9.5 13 14 12 C12 16.5 9.5 19.5 4.5 21 Z" fill="#1F6B3A"/></svg>';
}

// ---------- Lavoura ----------
export const CULTURAS = ['Soja', 'Milho', 'Feijão', 'Sorgo', 'Trigo', 'Aveia-preta (cobertura)', 'Braquiária', 'Mandioca', 'Pousio', 'Outra'];

export function lavoura(ctx, id, aviso) {
  const l = ctx.fazenda.lavouras.find((x) => x.id === id);
  if (!l) return `<div class="pagina">${voltar('#/roca', 'Minha roça')}<p>Área não encontrada.</p></div>`;
  const extras = ctx.registros[id] || { historico: [], aplicacoes: [] };
  const historico = [...extras.historico.map((h) => ({ ...h, novo: true })), ...[...l.historico].reverse()];
  const aplicacoes = [...extras.aplicacoes.map((a) => ({ ...a, novo: true })), ...l.aplicacoes].sort((a, b) => (a.data < b.data ? 1 : -1));
  const hoje = hojeISO();
  return `
<div class="pagina">
  ${voltar('#/roca', 'Minha roça')}
  <div class="lavoura-topo">
    <span class="lavoura-icone" style="width:52px;height:52px">${iconeCultura(l.cultura)}</span>
    <div class="cabeca"><h1>${esc(l.nome)}</h1><p>${l.hectares} hectares · ${esc(l.cultura)} · <span class="pilula ${l.plantio ? '' : 'aviso'}">${esc(l.status)}</span></p></div>
  </div>

  <div class="dupla">
    <div class="info"><span class="rot">Plantio</span><strong>${l.plantio ? fmtData(l.plantio) : 'A plantar'}</strong><span class="sub">${l.plantio ? `há ${Math.round(diasEntre(l.plantio, hoje) / 7)} semanas` : 'esperando a chuva'}</span></div>
    <div class="info"><span class="rot">Colheita prevista</span><strong>${l.colheitaPrevista ? fmtData(l.colheitaPrevista) : '—'}</strong><span class="sub">${l.colheitaPrevista ? `daqui a ${Math.round(diasEntre(hoje, l.colheitaPrevista) / 7)} semanas` : 'depois do plantio'}</span></div>
  </div>

  ${id === 'milho' ? `<a class="plantio-destaque" href="#/plantio"><div style="flex:1"><strong>O que plantar depois do milho?</strong><span>Compare 3 caminhos para esta área</span></div>${ICONES.seta}</a>` : ''}

  ${aviso ? `<p class="mensagem-ok" role="status">${esc(aviso)}</p>` : ''}

  <section class="cartao" aria-label="Histórico da área">
    <div class="linha-titulo"><h2>O que já foi plantado aqui</h2></div>
    <p class="fonte">O Semeia usa este histórico para sugerir a rotação. Pode lançar safras antigas.</p>
    <ul class="historico">
      ${historico.map((h) => `<li class="${h.novo ? 'novo' : ''}"><span class="safra">${esc(h.safra)}</span><span><span class="cultura">${esc(h.cultura)}</span>${h.atual ? ' · agora' : ''}${h.nota ? `<span class="nota">${esc(h.nota)}</span>` : ''}${h.novo ? '<span class="nota">lançado no app</span>' : ''}</span></li>`).join('')}
    </ul>
    <details>
      <summary class="botao pequeno contorno" style="list-style:none;justify-content:center">+ Lançar safra antiga</summary>
      <form class="form" data-form="historico" data-lavoura="${esc(id)}" style="margin-top:8px">
        <label>Safra<input name="safra" required maxlength="40" placeholder="Ex.: Safrinha 2023"></label>
        <label>O que foi plantado<select name="cultura" required>${CULTURAS.map((c) => `<option>${esc(c)}</option>`).join('')}</select></label>
        <label>Como foi (opcional)<input name="nota" maxlength="80" placeholder="Ex.: perdeu na seca"></label>
        <div class="linha-botoes"><button class="botao pequeno" type="submit">Salvar</button></div>
      </form>
    </details>
  </section>

  <section class="cartao" aria-label="Aplicações no solo">
    <h2>Aplicações no solo</h2>
    <ul class="historico aplicacoes">
      ${aplicacoes.slice(0, 8).map((a) => `<li class="${a.novo ? 'novo' : ''}"><span class="safra">${fmtDataCurta(a.data)}</span><span class="cultura">${esc(a.produto)}</span><span>${esc(a.qtd)}</span></li>`).join('')}
    </ul>
    <details>
      <summary class="botao pequeno" style="list-style:none;justify-content:center">+ Registrar aplicação</summary>
      <form class="form" data-form="aplicacao" data-lavoura="${esc(id)}" style="margin-top:8px">
        <label>Data<input name="data" type="date" required value="${hoje}" max="${hoje}"></label>
        <label>Produto<input name="produto" required maxlength="60" placeholder="Ex.: Ureia (cobertura)"></label>
        <label>Quantidade por hectare<input name="qtd" required maxlength="20" placeholder="Ex.: 100 kg/ha"></label>
        <div class="linha-botoes"><button class="botao pequeno" type="submit">Salvar</button></div>
      </form>
    </details>
  </section>
</div>`;
}
