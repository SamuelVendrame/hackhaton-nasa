import { arred, contar, hoje, maiorSequencia, media, mesDia, percentil, soma, somarDias, variacaoPct } from "../core/calc";
import { resultado, type Local } from "../core/tipos";
import { buscarImerg, buscarSmap, estadoToken, FONTE_IMERG, FONTE_SMAP, type DiaImerg, type DiaSmap } from "../fontes/earthdata";
import { FONTE_POWER } from "../fontes/nasa-power";
import { carregarHistorico, climatologiaDiaria } from "./base-clima";
import { buscarModis, FONTE_MODIS, type Composicao } from "../fontes/modis";

/* --------------------------------- NDVI (MODIS) --------------------------------- */

export function classeNdvi(ndvi: number | null) {
  if (ndvi == null) return "sem dado";
  if (ndvi < 0.25) return "solo exposto ou palhada";
  if (ndvi < 0.5) return "cobertura parcial";
  if (ndvi < 0.7) return "vegetação moderada";
  return "vegetação densa";
}

/** Composição válida: tem NDVI e não está marcada como nuvem/neve/sem dado. */
const valida = (c: Composicao) => c.ndvi != null && (c.confiabilidade == null || c.confiabilidade <= 1);

/**
 * Análise pura da série NDVI: situação atual, tendência, comparação com os mesmos
 * 16 dias em anos anteriores e períodos de solo exposto nos últimos 12 meses.
 */
export function analisarNdvi(serie: Composicao[], mesmoPeriodoAnosAnteriores: Composicao[]) {
  const validas = serie.filter(valida);
  const atual = validas.at(-1) ?? null;
  const anterior = validas.length >= 3 ? validas.at(-3)! : null;
  const variacao32d = atual && anterior ? arred(atual.ndvi! - anterior.ndvi!, 2) : null;
  const hist = mesmoPeriodoAnosAnteriores.filter(valida).map((c) => c.ndvi!);
  const normal = hist.length ? percentil(hist, 0.5) : null;
  const tendencia =
    variacao32d == null ? "indefinida" : variacao32d >= 0.08 ? "subindo" : variacao32d <= -0.08 ? "caindo" : "estável";
  const expostoMaiorSeq = maiorSequencia(validas, (c) => c.ndvi! < 0.3);
  return {
    atual: atual && { data: atual.data, ndvi: arred(atual.ndvi, 2), evi: arred(atual.evi, 2), classe: classeNdvi(atual.ndvi) },
    tendencia,
    variacao32d,
    normalMesmaEpoca: arred(normal, 2),
    anosNaComparacao: hist.length,
    anomalia: atual && normal != null ? arred(atual.ndvi! - normal, 2) : null,
    composicoesValidas: validas.length,
    composicoesComNuvem: serie.length - validas.length,
    solo: {
      composicoesExpostas12m: contar(validas, (c) => c.ndvi! < 0.3),
      maiorPeriodoExpostoDias: expostoMaiorSeq * 16,
    },
    serie: serie.map((c) => ({ data: c.data, ndvi: arred(c.ndvi, 2), confiavel: valida(c) })),
  };
}

export async function vegetacao(local: Local, data = hoje()) {
  const inicio = somarDias(data, -365);
  const busca = await buscarModis(local.lat, local.lon, inicio, data);
  const serie = busca.composicoes;
  const ultima = serie.filter(valida).at(-1)?.data ?? serie.at(-1)?.data ?? data;
  // A mesma composição de 16 dias nos 5 anos anteriores.
  const anos = [1, 2, 3, 4, 5];
  const historico = (
    await Promise.all(
      anos.map((n) => {
        const d = `${Number(ultima.slice(0, 4)) - n}${ultima.slice(4)}`;
        return buscarModis(local.lat, local.lon, somarDias(d, -8), somarDias(d, 8), 2).then((r) => r.composicoes).catch(() => [] as Composicao[]);
      }),
    )
  ).flat();
  const a = analisarNdvi(serie, historico);
  const resumo: string[] = [];
  if (a.atual) {
    resumo.push(
      `NDVI de ${a.atual.ndvi} na composição de ${a.atual.data} (${a.atual.classe}); tendência ${a.tendencia}` +
        (a.variacao32d != null ? ` (${a.variacao32d >= 0 ? "+" : ""}${a.variacao32d} em ~32 dias).` : "."),
    );
    if (a.normalMesmaEpoca != null)
      resumo.push(
        `Na mesma época dos últimos ${a.anosNaComparacao} anos o NDVI mediano foi ${a.normalMesmaEpoca}: ` +
          `${a.anomalia! >= 0.05 ? "acima" : a.anomalia! <= -0.05 ? "abaixo" : "perto"} do usual (${a.anomalia! >= 0 ? "+" : ""}${a.anomalia}).`,
      );
  } else resumo.push("Sem composição MODIS válida no período (nuvem ou falta de dado).");
  if (a.solo.composicoesExpostas12m)
    resumo.push(
      `Nos últimos 12 meses o ponto ficou com pouca cobertura (NDVI < 0,3) em ${a.solo.composicoesExpostas12m} composições; ` +
        `o maior período seguido foi de ~${a.solo.maiorPeriodoExpostoDias} dias.`,
    );
  return resultado("vegetacao_ndvi", {
    local,
    periodo: { inicio, fim: data },
    resumo,
    dados: a,
    fontes: [FONTE_MODIS],
    limitacoes: [
      "Pixel de 250 m: só representa a lavoura se o ponto for do talhão e a área for maior que ~6 ha. A coordenada do CEP é a da cidade.",
      "Composição de 16 dias com atraso de ~2 semanas; nuvem persistente deixa lacunas.",
      "NDVI mede verde/cobertura, não diagnostica a causa (seca, praga, colheita, dessecação).",
      ...(local.precisao !== "talhao" ? ["Ponto não é do talhão: o valor reflete o entorno urbano/misto."] : []),
      ...(busca.lotesComFalha ? [`O serviço MODIS falhou em ${busca.lotesComFalha} de ${busca.lotes} pedidos: a série do último ano está incompleta.`] : []),
    ],
  });
}

/* ------------------------------ Umidade do solo (SMAP) ------------------------------ */

export function resumirSmap(dias: DiaSmap[], historicoPorAno: { ano: number; dias: DiaSmap[] }[]) {
  const val = (d: DiaSmap) => d.umidade ?? d.umidadeArea;
  const comDado = dias.filter((d) => val(d) != null);
  const metade = Math.floor(dias.length / 2);
  const m1 = media(dias.slice(0, metade).map(val));
  const m2 = media(dias.slice(metade).map(val));
  const mediaJanela = media(dias.map(val));
  const hist = historicoPorAno
    .map((h) => ({ ano: h.ano, media: arred(media(h.dias.map(val)), 3) }))
    .filter((h) => h.media != null);
  const mediaHist = media(hist.map((h) => h.media));
  const ultimo = comDado.at(-1) ?? null;
  return {
    ultimo: ultimo && { data: ultimo.data, umidade: arred(val(ultimo), 3), noPonto: ultimo.umidade != null },
    mediaJanela: arred(mediaJanela, 3),
    tendencia: m1 == null || m2 == null ? "indefinida" : m2 - m1 >= 0.03 ? "umedecendo" : m2 - m1 <= -0.03 ? "secando" : "estável",
    diasComPassagem: comDado.length,
    diasNaJanela: dias.length,
    mesmaJanelaAnosAnteriores: hist,
    variacaoSobreAnosAnterioresPct: arred(variacaoPct(mediaJanela, mediaHist), 0),
    serie: dias.map((d) => ({ data: d.data, umidade: arred(val(d), 3) })),
  };
}

export async function umidadeSoloSatelite(local: Local, dias = 30, anosHistorico = 2) {
  const fim = somarDias(hoje(), -1);
  const inicio = somarDias(fim, -(dias - 1));
  const [atual, ...historico] = await Promise.all([
    buscarSmap(local.lat, local.lon, inicio, fim),
    ...Array.from({ length: anosHistorico }, (_, i) => {
      const n = i + 1;
      const ini = `${Number(inicio.slice(0, 4)) - n}${inicio.slice(4)}`;
      const f = `${Number(fim.slice(0, 4)) - n}${fim.slice(4)}`;
      return buscarSmap(local.lat, local.lon, ini, f).catch(() => [] as DiaSmap[]);
    }),
  ]);
  const r = resumirSmap(
    atual!,
    historico.map((d, i) => ({ ano: Number(inicio.slice(0, 4)) - i - 1, dias: d })),
  );
  const tok = estadoToken();
  const resumo: string[] = [];
  if (r.ultimo)
    resumo.push(
      `Última passagem do satélite SMAP (${r.ultimo.data}): umidade de ${r.ultimo.umidade} m³/m³ na camada superficial (0–5 cm); ` +
        `média dos últimos ${dias} dias ${r.mediaJanela} m³/m³, tendência ${r.tendencia}.`,
    );
  else resumo.push(`Sem passagem válida do SMAP nos últimos ${dias} dias.`);
  if (r.variacaoSobreAnosAnterioresPct != null)
    resumo.push(
      `Comparado à mesma janela em ${r.mesmaJanelaAnosAnteriores.map((h) => h.ano).join(" e ")}: ` +
        `${r.variacaoSobreAnosAnterioresPct >= 0 ? "+" : ""}${r.variacaoSobreAnosAnterioresPct}%.`,
    );
  return resultado("umidade_solo_satelite", {
    local,
    periodo: { inicio, fim },
    resumo,
    dados: r,
    fontes: [FONTE_SMAP],
    limitacoes: [
      "Pixel de 9 km e só os primeiros ~5 cm do solo: mostra a tendência da região, não a umidade na raiz do talhão.",
      "O satélite passa a cada 2 a 3 dias; os dias sem passagem ficam vazios.",
      "Valores típicos: solo arenoso seco < 0,10 e úmido > 0,25 m³/m³; solo argiloso tem valores mais altos. Compare com anos anteriores, não com um número fixo.",
      ...(anosHistorico < 5 ? [`Comparação com só ${anosHistorico} anos anteriores: indicativa.`] : []),
      ...(tok.diasRestantes != null && tok.diasRestantes < 10 ? [`Token Earthdata expira em ${tok.diasRestantes} dias (${tok.expiraEm}).`] : []),
    ],
  });
}

/* ------------------------------- Chuva (GPM IMERG) ------------------------------- */

/**
 * Compara a chuva medida por satélite (IMERG) com a normal de 20 anos (POWER)
 * e com a reanálise POWER dos mesmos dias. Função pura.
 */
export function compararChuvaSatelite(
  imerg: DiaImerg[],
  normalPorDia: (data: string) => number | null,
  powerPorDia: (data: string) => number | null,
) {
  const comDado = imerg.filter((d) => d.chuva != null);
  const total = soma(comDado.map((d) => d.chuva));
  const normal = soma(comDado.map((d) => normalPorDia(d.data)));
  const powerDias = comDado.filter((d) => powerPorDia(d.data) != null);
  const totalPowerMesmosDias = powerDias.length ? soma(powerDias.map((d) => powerPorDia(d.data))) : null;
  const totalImergMesmosDias = powerDias.length ? soma(powerDias.map((d) => d.chuva)) : null;
  const maior = comDado.reduce<DiaImerg | null>((m, d) => (m == null || d.chuva! > m.chuva! ? d : m), null);
  return {
    diasComDado: comDado.length,
    diasNaJanela: imerg.length,
    totalMm: arred(total, 0),
    normalMm: arred(normal, 0),
    anomaliaPct: arred(variacaoPct(total, normal), 0),
    diasComChuva: contar(comDado, (d) => d.chuva! >= 1),
    diasChuvaForte: contar(comDado, (d) => d.chuva! >= 50),
    maiorSequenciaSecaDias: maiorSequencia(imerg, (d) => d.chuva != null && d.chuva < 1),
    maiorChuva: maior && { data: maior.data, mm: arred(maior.chuva, 0) },
    conferenciaPower:
      totalPowerMesmosDias == null
        ? null
        : { dias: powerDias.length, imergMm: arred(totalImergMesmosDias, 0), powerMm: arred(totalPowerMesmosDias, 0) },
    serie: imerg.map((d) => ({ data: d.data, mm: arred(d.chuva, 1) })),
  };
}

export async function chuvaSatelite(local: Local, dias = 30) {
  const fim = somarDias(hoje(), -1);
  const inicio = somarDias(fim, -(dias - 1));
  const [imerg, hist] = await Promise.all([buscarImerg(local.lat, local.lon, inicio, fim), carregarHistorico(local)]);
  const normal = climatologiaDiaria(hist);
  const c = compararChuvaSatelite(
    imerg,
    (d) => normal.get(mesDia(d))?.chuva ?? null,
    (d) => hist.dias.get(d)?.chuva ?? null,
  );
  const sinal = (x: number | null) => (x != null && x >= 0 ? "+" : "");
  const resumo = [
    `Satélite GPM (IMERG), ${c.diasComDado} de ${c.diasNaJanela} dias até ${fim}: ${c.totalMm} mm, contra normal de ${c.normalMm} mm ` +
      `(${sinal(c.anomaliaPct)}${c.anomaliaPct}%). ${c.diasComChuva} dias com chuva; maior sequência seca de ${c.maiorSequenciaSecaDias} dias.`,
  ];
  if (c.maiorChuva) resumo.push(`Maior chuva diária: ${c.maiorChuva.mm} mm em ${c.maiorChuva.data}${c.diasChuvaForte ? ` (${c.diasChuvaForte} dia(s) ≥ 50 mm)` : ""}.`);
  if (c.conferenciaPower)
    resumo.push(`Nos ${c.conferenciaPower.dias} dias em que as duas fontes têm dado: satélite ${c.conferenciaPower.imergMm} mm, reanálise POWER ${c.conferenciaPower.powerMm} mm.`);
  return resultado("chuva_satelite", {
    local,
    periodo: { inicio, fim },
    resumo,
    dados: c,
    fontes: [FONTE_IMERG, FONTE_POWER],
    limitacoes: [
      "Estimativa por satélite em pixel de ~10 km: chuva de pancada isolada pode não aparecer, ou aparecer no vizinho.",
      "Produto 'Late' (sai em ~14 h); a versão final calibrada com pluviômetros chega ~3 meses depois.",
      "Pluviômetro na propriedade é a melhor referência; se o produtor tiver, vale preferir.",
    ],
  });
}
