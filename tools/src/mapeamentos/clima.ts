import {
  arred,
  contar,
  hoje,
  maiorSequencia,
  maximo,
  media,
  mesDia,
  minimo,
  percentil,
  somarDias,
  soma,
  variacaoPct,
} from "../core/calc";
import { resultado, type DiaClima, type Local, type Periodo } from "../core/tipos";
import { buscarPrevisao, FONTE_PREVISAO } from "../fontes/open-meteo";
import { FONTE_POWER } from "../fontes/nasa-power";
import { carregarHistorico, chuvaNormal, climatologiaDiaria, janelaPorAno, serieJanela, type Historico } from "./base-clima";

/* ------------------------------------------------------------------ */
/* Cálculos puros (testáveis sem rede)                                 */
/* ------------------------------------------------------------------ */

/** Abrigo a 2 m ≤ 3 °C costuma corresponder a ~0 °C na relva (geada possível). */
export const LIMIAR_GEADA = 3;
export const LIMIAR_GEADA_FORTE = 0;

type DiaHist = { tmin: number | null; tmax: number | null; chuva: number | null };

export function calcularGeada(dias: DiaClima[], anos: { ano: number; dias: DiaHist[] }[]) {
  const deterministicos = dias.filter((d) => d.origem === "observado" || d.origem === "previsao");
  const sazonais = dias.filter((d) => d.origem === "previsao_sazonal");
  const anosComGeada = anos.filter((a) => a.dias.some((d) => d.tmin != null && d.tmin <= LIMIAR_GEADA));
  const anosComGeadaForte = anos.filter((a) => a.dias.some((d) => d.tmin != null && d.tmin <= LIMIAR_GEADA_FORTE));

  // Probabilidade pelo ensemble sazonal: fração de membros com ao menos um dia ≤ limiar.
  let probSazonal: number | null = null;
  const nMembros = sazonais[0]?.membros?.tmin.length ?? 0;
  if (nMembros) {
    let com = 0;
    for (let m = 0; m < nMembros; m++) if (sazonais.some((d) => (d.membros!.tmin[m] ?? 99) <= LIMIAR_GEADA)) com++;
    probSazonal = com / nMembros;
  }

  return {
    diasPrevistosComRisco: deterministicos.filter((d) => d.tmin != null && d.tmin <= LIMIAR_GEADA).map((d) => ({ data: d.data, tmin: d.tmin, origem: d.origem })),
    menorMinimaPrevista: arred(minimo(deterministicos.map((d) => d.tmin))),
    probabilidadeSazonal: arred(probSazonal, 2),
    historico: {
      anosAnalisados: anos.length,
      anosComRiscoGeada: anosComGeada.length,
      anosComGeadaForte: anosComGeadaForte.length,
      frequencia: anos.length ? arred(anosComGeada.length / anos.length, 2) : null,
      menorMinimaRegistrada: arred(minimo(anos.flatMap((a) => a.dias.map((d) => d.tmin)))),
      anos: anosComGeada.map((a) => a.ano),
    },
  };
}

export function calcularCalor(dias: DiaClima[], anos: { ano: number; dias: DiaHist[] }[], limiar: number) {
  const det = dias.filter((d) => d.origem === "observado" || d.origem === "previsao");
  const saz = dias.filter((d) => d.origem === "previsao_sazonal");
  const porAno = anos.map((a) => contar(a.dias, (d) => d.tmax != null && d.tmax >= limiar));
  let diasSazonalMedio: number | null = null;
  const nMembros = saz[0]?.membros?.tmax.length ?? 0;
  if (nMembros) {
    const porMembro: number[] = [];
    for (let m = 0; m < nMembros; m++) porMembro.push(contar(saz, (d) => (d.membros!.tmax[m] ?? -99) >= limiar));
    diasSazonalMedio = media(porMembro);
  }
  return {
    limiar,
    diasPrevistosAcimaLimiar: det.filter((d) => d.tmax != null && d.tmax >= limiar).map((d) => ({ data: d.data, tmax: d.tmax })),
    maiorSequenciaPrevista: maiorSequencia(det, (d) => d.tmax != null && d.tmax >= limiar),
    maiorMaximaPrevista: arred(maximo(det.map((d) => d.tmax))),
    diasSazonaisAcimaLimiar_media: arred(diasSazonalMedio),
    historico: {
      mediaDiasPorAno: arred(media(porAno)),
      p90DiasPorAno: arred(percentil(porAno, 0.9)),
      anosAnalisados: anos.length,
    },
  };
}

export function calcularChuva(dias: DiaClima[], anos: { ano: number; dias: DiaHist[] }[], normalMm: number) {
  const total = soma(dias.map((d) => d.chuva));
  const det = dias.filter((d) => d.origem === "observado" || d.origem === "previsao");
  const totaisHist = anos.map((a) => soma(a.dias.map((d) => d.chuva)));
  const t1 = percentil(totaisHist, 1 / 3);
  const t2 = percentil(totaisHist, 2 / 3);
  const classe = t1 == null || t2 == null ? null : total < t1 ? "abaixo do normal" : total > t2 ? "acima do normal" : "dentro do normal";

  // Faixa do total pela previsão sazonal: totais por membro (só a parte sazonal) + o resto fixo.
  const saz = dias.filter((d) => d.origem === "previsao_sazonal");
  let faixa: { p10: number | null; p90: number | null } | null = null;
  let probTercis: { abaixo: number; normal: number; acima: number } | null = null;
  const n = saz[0]?.membros?.chuva.length ?? 0;
  if (n) {
    const fixo = soma(dias.filter((d) => d.origem !== "previsao_sazonal").map((d) => d.chuva));
    const totais: number[] = [];
    for (let m = 0; m < n; m++) totais.push(fixo + soma(saz.map((d) => d.membros!.chuva[m])));
    faixa = { p10: arred(percentil(totais, 0.1), 0), p90: arred(percentil(totais, 0.9), 0) };
    if (t1 != null && t2 != null)
      probTercis = {
        abaixo: arred(contar(totais, (x) => x < t1) / n, 2)!,
        normal: arred(contar(totais, (x) => x >= t1 && x <= t2) / n, 2)!,
        acima: arred(contar(totais, (x) => x > t2) / n, 2)!,
      };
  }
  // Janela dominada pela previsão sazonal: o total bruto do modelo tem viés; a classificação
  // vira "tendência" e deve ser lida junto com as probabilidades por tercil.
  const dominanteSazonal = saz.length > dias.length / 2;

  return {
    totalMm: arred(total, 0),
    normalMm: arred(normalMm, 0),
    anomaliaPct: arred(variacaoPct(total, normalMm), 0),
    classificacao: classe && dominanteSazonal ? `tendência ${classe} (modelo sazonal)` : classe,
    faixaSazonalMm: faixa,
    probabilidadeTercis: probTercis,
    tercisHistoricosMm: { inferior: arred(t1, 0), superior: arred(t2, 0) },
    // Sequências secas e extremos só fazem sentido com dados dia a dia (observado/previsão).
    diasComChuvaPrevistos: contar(det, (d) => (d.chuva ?? 0) >= 1),
    maiorSequenciaSecaPrevista: maiorSequencia(det, (d) => (d.chuva ?? 0) < 1),
    diasChuvaForte: det.filter((d) => (d.chuva ?? 0) >= 50).map((d) => ({ data: d.data, mm: d.chuva })),
    historico: {
      mediaMaiorSequenciaSeca: arred(media(anos.map((a) => maiorSequencia(a.dias, (d) => (d.chuva ?? 0) < 1)))),
      mediaDiasChuvaForte: arred(media(anos.map((a) => contar(a.dias, (d) => (d.chuva ?? 0) >= 50))), 2),
    },
  };
}

/* ------------------------------------------------------------------ */
/* Ferramentas                                                         */
/* ------------------------------------------------------------------ */

function descreverCobertura(c: Record<string, number>) {
  const partes = Object.entries(c)
    .filter(([, n]) => n)
    .map(([k, n]) => `${n} dia(s) de ${k.replace("_", " ")}`);
  return `Base dos dados da janela: ${partes.join(", ")}.`;
}

export async function riscoGeada(local: Local, periodo: Periodo) {
  const s = await serieJanela(local, periodo);
  const anos = janelaPorAno(s.historico, periodo);
  const g = calcularGeada(s.dias, anos);
  const resumo = [descreverCobertura(s.cobertura)];
  if (g.diasPrevistosComRisco.length)
    resumo.push(`Previsão indica ${g.diasPrevistosComRisco.length} dia(s) com mínima ≤ ${LIMIAR_GEADA} °C (risco de geada): ${g.diasPrevistosComRisco.map((d) => `${d.data} (${arred(d.tmin)} °C)`).join(", ")}.`);
  else if (s.cobertura.previsao || s.cobertura.observado) resumo.push(`Nenhum dia previsto/observado com mínima ≤ ${LIMIAR_GEADA} °C; menor mínima: ${g.menorMinimaPrevista} °C.`);
  if (g.probabilidadeSazonal != null) resumo.push(`Previsão sazonal: ${Math.round(g.probabilidadeSazonal * 100)}% dos cenários têm ao menos um dia com risco de geada.`);
  resumo.push(`Histórico: em ${g.historico.anosComRiscoGeada} de ${g.historico.anosAnalisados} anos houve ao menos um dia com risco de geada nesta mesma janela (geada forte, ≤ 0 °C: ${g.historico.anosComGeadaForte} anos).`);
  return resultado("risco_geada", {
    local,
    periodo,
    resumo,
    dados: g,
    fontes: s.fontes,
    limitacoes: [...s.limitacoes, "Limiar de 3 °C no abrigo (2 m) é aproximação da geada na relva; geada depende de relevo, vento e céu limpo."],
  });
}

export async function estresseCalor(local: Local, periodo: Periodo, limiar = 34) {
  const s = await serieJanela(local, periodo);
  const anos = janelaPorAno(s.historico, periodo);
  const c = calcularCalor(s.dias, anos, limiar);
  const resumo = [descreverCobertura(s.cobertura)];
  if (s.cobertura.previsao || s.cobertura.observado)
    resumo.push(`${c.diasPrevistosAcimaLimiar.length} dia(s) previstos/observados com máxima ≥ ${limiar} °C (maior sequência: ${c.maiorSequenciaPrevista}); maior máxima: ${c.maiorMaximaPrevista} °C.`);
  if (c.diasSazonaisAcimaLimiar_media != null) resumo.push(`Previsão sazonal: em média ${c.diasSazonaisAcimaLimiar_media} dia(s) com máxima ≥ ${limiar} °C na parte além de 16 dias.`);
  resumo.push(`Histórico: média de ${c.historico.mediaDiasPorAno} dia(s) por ano com máxima ≥ ${limiar} °C nesta janela (anos mais quentes: ${c.historico.p90DiasPorAno}).`);
  return resultado("estresse_calor", { local, periodo, resumo, dados: c, fontes: s.fontes, limitacoes: s.limitacoes });
}

export async function chuvaJanela(local: Local, periodo: Periodo) {
  const s = await serieJanela(local, periodo);
  const anos = janelaPorAno(s.historico, periodo);
  const c = calcularChuva(s.dias, anos, chuvaNormal(s.normal, periodo));
  const resumo = [
    descreverCobertura(s.cobertura),
    `Chuva esperada na janela: ${c.totalMm} mm, contra normal de ${c.normalMm} mm (${c.anomaliaPct != null && c.anomaliaPct >= 0 ? "+" : ""}${c.anomaliaPct}%) — ${c.classificacao}.`,
  ];
  if (c.faixaSazonalMm) resumo.push(`Faixa provável pelos cenários sazonais: ${c.faixaSazonalMm.p10} a ${c.faixaSazonalMm.p90} mm.`);
  if (c.probabilidadeTercis)
    resumo.push(`Probabilidade pelos cenários sazonais: ${Math.round(c.probabilidadeTercis.abaixo * 100)}% abaixo do normal, ${Math.round(c.probabilidadeTercis.normal * 100)}% normal, ${Math.round(c.probabilidadeTercis.acima * 100)}% acima.`);
  if (s.cobertura.previsao) resumo.push(`Nos dias com previsão: maior sequência sem chuva de ${c.maiorSequenciaSecaPrevista} dia(s); ${c.diasChuvaForte.length} dia(s) com chuva ≥ 50 mm.`);
  resumo.push(`Histórico da janela: maior sequência seca média de ${c.historico.mediaMaiorSequenciaSeca} dias.`);
  return resultado("chuva_janela", { local, periodo, resumo, dados: c, fontes: s.fontes, limitacoes: s.limitacoes });
}

/** Panorama geral da janela: temperatura, chuva, geada e calor numa chamada (mesmo cache). */
export async function climaJanela(local: Local, periodo: Periodo, limiarCalor = 34) {
  const s = await serieJanela(local, periodo);
  const anos = janelaPorAno(s.historico, periodo);
  const chuva = calcularChuva(s.dias, anos, chuvaNormal(s.normal, periodo));
  const geada = calcularGeada(s.dias, anos);
  const calor = calcularCalor(s.dias, anos, limiarCalor);
  const tmin = media(s.dias.map((d) => d.tmin));
  const tmax = media(s.dias.map((d) => d.tmax));
  const nTmin = media(s.dias.map((d) => s.normal.get(mesDia(d.data))?.tmin));
  const nTmax = media(s.dias.map((d) => s.normal.get(mesDia(d.data))?.tmax));
  const dados = {
    temperatura: {
      minimaMedia: arred(tmin),
      maximaMedia: arred(tmax),
      normalMinima: arred(nTmin),
      normalMaxima: arred(nTmax),
      anomaliaMinima: arred(tmin != null && nTmin != null ? tmin - nTmin : null),
      anomaliaMaxima: arred(tmax != null && nTmax != null ? tmax - nTmax : null),
    },
    chuva,
    geada,
    calor,
    cobertura: s.cobertura,
    semanas: resumoSemanal(s.dias),
  };
  const resumo = [
    descreverCobertura(s.cobertura),
    `Temperatura média esperada: mínimas de ${dados.temperatura.minimaMedia} °C e máximas de ${dados.temperatura.maximaMedia} °C (normal: ${dados.temperatura.normalMinima} / ${dados.temperatura.normalMaxima} °C).`,
    `Chuva: ${chuva.totalMm} mm contra normal de ${chuva.normalMm} mm — ${chuva.classificacao}.`,
    `Geada: em ${geada.historico.anosComRiscoGeada}/${geada.historico.anosAnalisados} anos houve risco nesta janela${geada.diasPrevistosComRisco.length ? `; previsão aponta ${geada.diasPrevistosComRisco.length} dia(s) de risco` : ""}.`,
    `Calor ≥ ${limiarCalor} °C: média histórica de ${calor.historico.mediaDiasPorAno} dia(s) por ano na janela.`,
  ];
  return resultado("clima_janela", { local, periodo, resumo, dados, fontes: s.fontes, limitacoes: s.limitacoes });
}

/** Agrega a série em semanas (para o app e para os resumos do WhatsApp). */
export function resumoSemanal(dias: DiaClima[]) {
  const semanas: { inicio: string; fim: string; chuvaMm: number | null; tmin: number | null; tmax: number | null; origem: string }[] = [];
  for (let i = 0; i < dias.length; i += 7) {
    const bloco = dias.slice(i, i + 7);
    const origens = [...new Set(bloco.map((d) => d.origem))];
    semanas.push({
      inicio: bloco[0]!.data,
      fim: bloco.at(-1)!.data,
      chuvaMm: arred(soma(bloco.map((d) => d.chuva)), 0),
      tmin: arred(minimo(bloco.map((d) => d.tmin))),
      tmax: arred(maximo(bloco.map((d) => d.tmax))),
      origem: origens.join("+"),
    });
  }
  return semanas;
}

/** Vento e rajadas nos próximos 16 dias (só previsão; o histórico NASA tem apenas vento médio). */
export async function ventoPrevisto(local: Local, limiarRajadaKmh = 60) {
  const p = await buscarPrevisao(local.lat, local.lon);
  const fortes = p.dias.filter((d) => (d.rajada ?? 0) >= limiarRajadaKmh);
  const dados = {
    limiarRajadaKmh,
    maiorRajada: arred(maximo(p.dias.map((d) => d.rajada))),
    maiorVentoMedio: arred(maximo(p.dias.map((d) => d.vento))),
    diasRajadaForte: fortes.map((d) => ({ data: d.data, rajadaKmh: d.rajada, ventoKmh: d.vento })),
    dias: p.dias.map((d) => ({ data: d.data, ventoKmh: d.vento, rajadaKmh: d.rajada })),
  };
  const periodo = { inicio: p.dias[0]!.data, fim: p.dias.at(-1)!.data };
  return resultado("vento_previsto", {
    local,
    periodo,
    resumo: [
      fortes.length
        ? `${fortes.length} dia(s) com rajadas ≥ ${limiarRajadaKmh} km/h: ${fortes.map((d) => `${d.data} (${arred(d.rajada, 0)} km/h)`).join(", ")}.`
        : `Sem rajadas ≥ ${limiarRajadaKmh} km/h previstas; maior rajada: ${dados.maiorRajada} km/h.`,
    ],
    dados,
    fontes: [FONTE_PREVISAO],
    limitacoes: ["Rajadas de tempestades isoladas são pouco previsíveis com antecedência; confiar mais nos 3 primeiros dias."],
  });
}

/** Umidade do solo: últimos 30 dias (NASA) contra a normal, e a tendência prevista. */
export async function umidadeSolo(local: Local) {
  const [hist, prev] = await Promise.all([
    carregarHistorico(local),
    buscarPrevisao(local.lat, local.lon).catch(() => null),
  ]);
  const normal = climatologiaDiaria(hist);
  const fim = somarDias(hoje(), -1);
  const inicio = somarDias(fim, -45);
  const { buscarPowerDiario, expande } = await import("../fontes/nasa-power");
  const rec = await buscarPowerDiario(local.lat, local.lon, inicio, fim, ["GWETROOT", "GWETTOP"]);
  const datas = Object.keys(rec.serie.GWETROOT ?? {}).filter((d) => rec.serie.GWETROOT![d] != null);
  const ult = datas.slice(-30);
  const atual = media(ult.map((d) => rec.serie.GWETROOT![d]));
  const normalPeriodo = media(ult.map((d) => normal.get(mesDia(expande(d)))?.umidSoloRaiz));
  const ultimoDia = ult.at(-1) ? expande(ult.at(-1)!) : null;
  // O fim do horizonte horário costuma vir sem valor de umidade: descarta dias vazios.
  const tendencia = (prev?.umidadeSolo ?? []).filter((d) => d.raiz_27_81cm != null);
  const dados = {
    umidadeRaiz30d: arred(atual, 2),
    normalRaiz: arred(normalPeriodo, 2),
    relacaoNormalPct: arred(variacaoPct(atual, normalPeriodo), 0),
    ultimoDiaComDado: ultimoDia,
    previsaoCamadaRaiz: tendencia.map((d) => ({ data: d.data, m3m3: arred(d.raiz_27_81cm, 3) })),
  };
  const ini = arred(tendencia[0]?.raiz_27_81cm, 3);
  const fimT = arred(tendencia.at(-1)?.raiz_27_81cm, 3);
  return resultado("umidade_solo", {
    local,
    periodo: { inicio, fim },
    resumo: [
      `Umidade na zona das raízes (últimos 30 dias com dado, até ${ultimoDia}): ${dados.umidadeRaiz30d} (escala 0–1), contra normal de ${dados.normalRaiz} para a época (${dados.relacaoNormalPct != null && dados.relacaoNormalPct >= 0 ? "+" : ""}${dados.relacaoNormalPct}%).`,
      ...(tendencia.length ? [`Previsão de umidade a 27–81 cm: de ${ini} para ${fimT} m³/m³ em ${tendencia.length} dias (${fimT! > ini! ? "umedecendo" : fimT! < ini! ? "secando" : "estável"}).`] : []),
    ],
    dados,
    fontes: [FONTE_POWER, ...(tendencia.length ? [FONTE_PREVISAO] : [])],
    limitacoes: [
      "Umidade de solo modelada (reanálise ~50 km), não medida no talhão; serve como tendência regional.",
      "Para medição por satélite (SMAP, 9 km) é necessária conta NASA Earthdata (pendente).",
    ],
  });
}

/** Como estão os últimos 30 e 90 dias em relação ao normal (chuva e temperatura). */
export async function condicaoRecente(local: Local) {
  const hist = await carregarHistorico(local);
  const normal = climatologiaDiaria(hist);
  const fim = somarDias(hoje(), -1);
  const s = await serieJanela(local, { inicio: somarDias(fim, -89), fim });
  const obs = s.dias.filter((d) => d.origem === "observado");
  const janela = (n: number) => {
    const ds = obs.slice(-n);
    const chuva = soma(ds.map((d) => d.chuva));
    const nChuva = soma(ds.map((d) => normal.get(mesDia(d.data))?.chuva));
    const tmed = media(ds.map((d) => (d.tmin! + d.tmax!) / 2));
    const nTmed = media(ds.map((d) => {
      const n = normal.get(mesDia(d.data));
      return n?.tmin != null && n?.tmax != null ? (n.tmin + n.tmax) / 2 : null;
    }));
    return {
      dias: ds.length,
      de: ds[0]?.data,
      ate: ds.at(-1)?.data,
      chuvaMm: arred(chuva, 0),
      normalMm: arred(nChuva, 0),
      anomaliaChuvaPct: arred(variacaoPct(chuva, nChuva), 0),
      anomaliaTempC: arred(tmed != null && nTmed != null ? tmed - nTmed : null),
    };
  };
  const d30 = janela(30);
  const d90 = janela(90);
  const sinal = (x: number | null) => (x != null && x >= 0 ? "+" : "");
  return resultado("condicao_recente", {
    local,
    periodo: { inicio: d90.de ?? "", fim: d90.ate ?? "" },
    resumo: [
      `Últimos ${d30.dias} dias (até ${d30.ate}): ${d30.chuvaMm} mm de chuva contra normal de ${d30.normalMm} mm (${sinal(d30.anomaliaChuvaPct)}${d30.anomaliaChuvaPct}%); temperatura ${sinal(d30.anomaliaTempC)}${d30.anomaliaTempC} °C em relação à média.`,
      `Últimos ${d90.dias} dias: ${d90.chuvaMm} mm contra ${d90.normalMm} mm (${sinal(d90.anomaliaChuvaPct)}${d90.anomaliaChuvaPct}%); temperatura ${sinal(d90.anomaliaTempC)}${d90.anomaliaTempC} °C.`,
    ],
    dados: { ultimos30: d30, ultimos90: d90 },
    fontes: [FONTE_POWER],
    limitacoes: ["NASA POWER tem atraso de alguns dias; os últimos dias antes de hoje podem não estar incluídos.", ...s.limitacoes.slice(0, 1)],
  });
}
