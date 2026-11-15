import { arred, media, variacaoPct } from "../core/calc";
import { ErroFonte } from "../core/http";
import { resultado, type Local } from "../core/tipos";
import { acharCultura } from "../conhecimento/culturas";
import { buscarPrecosMensais, buscarPrecosSemanais, FONTE_DERAL, REGIONAL_POR_MUNICIPIO, type PrecoMensal } from "../fontes/deral";
import { buscarPam, type LinhaPam } from "../fontes/ibge";
import { buscarEstacoes, estacoesProximas as proximas, FONTE_INMET } from "../fontes/inmet";
import { buscarSoilGrids, FONTE_SOILGRIDS, type CamadaSolo } from "../fontes/soilgrids";

const FONTE_PAM = {
  nome: "IBGE — Produção Agrícola Municipal (SIDRA, tabela 5457)",
  url: "https://sidra.ibge.gov.br/tabela/5457",
  tipo: "estatistica_oficial" as const,
};

/* ----------------------------- Culturas da região ----------------------------- */

export function rankearCulturas(linhas: LinhaPam[]) {
  const anos = [...new Set(linhas.map((l) => l.ano))].sort();
  const ultimo = anos.at(-1)!;
  const primeiro = anos[0]!;
  const valor = (ano: number, produto: string, v: LinhaPam["variavel"]) =>
    linhas.find((l) => l.ano === ano && l.produto === produto && l.variavel === v)?.valor ?? null;
  const produtos = [...new Set(linhas.filter((l) => l.ano === ultimo && l.variavel === "area_colhida_ha" && (l.valor ?? 0) > 0).map((l) => l.produto))]
    // "Café (em grão) Total" e as variedades se repetem; fica só o total.
    .filter((p) => !/Café \(em grão\) (Arábica|Canephora)/.test(p));
  const total = produtos.reduce((a, p) => a + (valor(ultimo, p, "area_colhida_ha") ?? 0), 0);
  return {
    ano: ultimo,
    anoComparacao: anos.length > 1 ? primeiro : null,
    areaTotalHa: total,
    culturas: produtos
      .map((p) => {
        const area = valor(ultimo, p, "area_colhida_ha")!;
        const areaAntes = anos.length > 1 ? valor(primeiro, p, "area_colhida_ha") : null;
        return {
          produto: p,
          areaColhidaHa: area,
          participacaoPct: arred((area / total) * 100),
          producaoT: valor(ultimo, p, "producao_t"),
          rendimentoKgHa: valor(ultimo, p, "rendimento_kg_ha"),
          valorMilReais: valor(ultimo, p, "valor_mil_reais"),
          variacaoAreaPct: arred(variacaoPct(area, areaAntes), 0),
        };
      })
      .sort((a, b) => b.areaColhidaHa - a.areaColhidaHa),
  };
}

export async function culturasRegiao(local: Local, anosComparacao = 5) {
  if (!local.ibge) throw new ErroFonte("ibge-sidra", "código IBGE do município é necessário");
  const r = rankearCulturas(await buscarPam(local.ibge, anosComparacao));
  const top = r.culturas.slice(0, 5);
  return resultado("culturas_regiao", {
    local,
    resumo: [
      `Em ${r.ano}, ${local.municipio ?? "o município"} colheu ${Math.round(r.areaTotalHa)} ha em lavouras. Principais: ${top.map((c) => `${c.produto} (${c.participacaoPct}%)`).join(", ")}.`,
      ...(r.anoComparacao
        ? [`Variação de área desde ${r.anoComparacao}: ${top.map((c) => `${c.produto} ${c.variacaoAreaPct != null && c.variacaoAreaPct >= 0 ? "+" : ""}${c.variacaoAreaPct ?? "?"}%`).join(", ")}.`]
        : []),
    ],
    dados: r,
    fontes: [FONTE_PAM],
    limitacoes: ["Estatística anual do município inteiro, publicada com cerca de um ano de atraso; não reflete a safra corrente."],
  });
}

/* ----------------------------- Solo estimado ----------------------------- */

/** Classe textural simplificada (triângulo SiBCS/Embrapa) pela argila e areia da camada superficial. */
export function classeTextural(argilaPct: number | null, areiaPct: number | null) {
  if (argilaPct == null) return null;
  if (argilaPct > 60) return "muito argilosa";
  if (argilaPct >= 35) return "argilosa";
  if (areiaPct != null && areiaPct - argilaPct > 70 && argilaPct < 15) return "arenosa";
  if (argilaPct < 15 && (areiaPct ?? 0) >= 70) return "arenosa";
  return "média";
}

export function resumirSolo(camadas: CamadaSolo[]) {
  const pega = (p: string, prof: string) => camadas.find((c) => c.propriedade === p && c.profundidade === prof);
  const sup = (p: string) => media(["0-5cm", "5-15cm", "15-30cm"].map((pr) => pega(p, pr)?.media));
  // SoilGrids: clay/sand/silt em %, phh2o em pH, soc em g/kg, nitrogen em g/kg, cec em cmol(c)/kg, bdod em kg/dm³.
  const argila = sup("clay");
  const areia = sup("sand");
  return {
    profundidade: "0–30 cm (média das camadas)",
    argilaPct: arred(argila),
    areiaPct: arred(areia),
    silte: arred(sup("silt")),
    ph: arred(sup("phh2o")),
    carbonoOrganicoGkg: arred(sup("soc")),
    nitrogenioGkg: arred(sup("nitrogen"), 2),
    ctcCmolKg: arred(sup("cec")),
    densidadeKgDm3: arred(sup("bdod"), 2),
    classeTextural: classeTextural(argila, areia),
  };
}

export async function soloEstimado(local: Local) {
  const camadas = await buscarSoilGrids(local.lat, local.lon);
  const s = resumirSolo(camadas);
  if (s.argilaPct == null)
    return resultado("solo_estimado", {
      local,
      resumo: ["SoilGrids não tem estimativa para este ponto (comum em área urbana ou corpo d'água). Informe a coordenada do talhão."],
      dados: { ...s, camadas },
      fontes: [FONTE_SOILGRIDS],
      limitacoes: ["Sem dado no ponto."],
    });
  const resumo = [
    `Solo estimado (0–30 cm): textura ${s.classeTextural} — argila ${s.argilaPct}%, areia ${s.areiaPct}%; pH ${s.ph}; carbono orgânico ${s.carbonoOrganicoGkg} g/kg; CTC ${s.ctcCmolKg} cmolc/kg.`,
  ];
  if (s.classeTextural === "arenosa" || (s.areiaPct ?? 0) > 70)
    resumo.push("Solo arenoso retém pouca água e é mais sujeito a erosão: culturas sensíveis a veranico têm mais risco; cobertura e palhada ajudam.");
  return resultado("solo_estimado", {
    local,
    resumo,
    dados: { ...s, camadas },
    fontes: [FONTE_SOILGRIDS],
    limitacoes: [
      "Estimativa por modelo global em 250 m, não análise do talhão. A análise de solo do produtor sempre prevalece.",
      "Fertilidade (P, K, saturação de bases, alumínio) não é estimada; só a análise laboratorial informa.",
      "Modelos globais costumam errar a textura e superestimar o carbono em solos tropicais (no noroeste do PR predominam solos arenosos do Arenito Caiuá); trate como ordem de grandeza.",
    ],
  });
}

/* ----------------------------- Mercado ----------------------------- */

export function tendenciaMensal(p: PrecoMensal) {
  const v = p.meses.map((m) => m.valor);
  const ultimos3 = media(v.slice(0, 3));
  const anteriores3 = media(v.slice(3, 6));
  const i0 = v.findIndex((x) => x != null);
  const ultimo = i0 >= 0 ? v[i0]! : null;
  const haUmAno = i0 >= 0 ? (v[i0 + 12] ?? null) : null;
  const var3m = variacaoPct(ultimos3, anteriores3);
  const direcao = var3m == null ? null : var3m > 3 ? "alta" : var3m < -3 ? "queda" : "estável";
  return {
    ultimoMes: p.meses.find((m) => m.valor != null)?.mes ?? null,
    ultimoValor: arred(ultimo, 2),
    media3mVsAnteriorPct: arred(var3m),
    vsMesmoMesAnoAnteriorPct: arred(variacaoPct(ultimo, haUmAno)),
    mediaAnoAtual: arred(p.anos[0]?.valor, 2),
    mediasAnuais: p.anos.map((a) => ({ ano: a.ano, valor: arred(a.valor, 2) })),
    direcao,
  };
}

export async function precosMercado(produto: string, local?: Local) {
  const cultura = acharCultura(produto);
  const nomes = (cultura?.nomes.deral ?? [produto]).map((n) => n.toLowerCase());
  const [sem, mes] = await Promise.all([buscarPrecosSemanais(), buscarPrecosMensais()]);
  const casa = (p: { produto: string }) => nomes.some((n) => p.produto.toLowerCase().startsWith(n));
  const semanais = sem.precos.filter(casa);
  const mensais = mes.precos.filter(casa);
  if (!semanais.length && !mensais.length)
    throw new ErroFonte("deral", `produto sem cotação no DERAL: ${produto}. Disponíveis: ${sem.precos.map((p) => p.produto).join(", ")}`);
  const regionais = (local?.ibge && REGIONAL_POR_MUNICIPIO[local.ibge]) || [];
  const itens = mensais.map((m) => {
    const s = semanais.find((x) => x.produto === m.produto && x.unidade === m.unidade) ?? semanais.find((x) => x.produto === m.produto);
    return {
      produto: m.produto,
      unidade: m.unidade,
      semana: sem.semana,
      periodoSemana: sem.periodo,
      mediaEstadoSemana: s?.mediaEstado ?? null,
      variacaoSemanalPct: s?.variacaoPct ?? null,
      regionais: Object.fromEntries(regionais.map((r) => [r, s?.porRegional[r] ?? null])),
      tendencia: tendenciaMensal(m),
      serieMensal: m.meses,
    };
  });
  const resumo = itens.map((i) => {
    const reg = Object.entries(i.regionais).filter(([, v]) => v != null).map(([r, v]) => `${r} R$ ${v!.toFixed(2)}`).join(", ");
    return `${i.produto} (${i.unidade}): média PR na semana ${i.semana} de R$ ${i.mediaEstadoSemana?.toFixed(2) ?? "?"}${reg ? ` (${reg})` : ""}; tendência de 3 meses: ${i.tendencia.direcao ?? "sem dados"} (${i.tendencia.media3mVsAnteriorPct ?? "?"}%); contra 1 ano atrás: ${i.tendencia.vsMesmoMesAnoAnteriorPct ?? "?"}%.`;
  });
  return resultado("precos_mercado", {
    local,
    resumo,
    dados: { produto, itens },
    fontes: [FONTE_DERAL],
    limitacoes: [
      "Preço médio recebido pelo produtor no Paraná (mercado disponível). Não é o preço pré-fixado da cooperativa, que precisa vir do produtor ou da cooperativa.",
      "Tendência passada não garante preço futuro na colheita.",
      ...(local?.ibge === "4105508" ? ["O DERAL não publica núcleo para Cianorte; usamos Umuarama e Maringá como referência regional."] : []),
    ],
  });
}

/* ----------------------------- Estações INMET ----------------------------- */

export async function estacoesProximas(local: Local, n = 3) {
  const est = proximas(await buscarEstacoes(), local.lat, local.lon, n);
  return resultado("estacoes_proximas", {
    local,
    resumo: [`Estações INMET operantes mais próximas: ${est.map((e) => `${e.nome} (${e.codigo}, ${e.distanciaKm} km)`).join("; ")}.`],
    dados: est,
    fontes: [FONTE_INMET],
    limitacoes: ["Os dados medidos das estações exigem token do INMET (INMET_TOKEN), ainda não configurado."],
  });
}
