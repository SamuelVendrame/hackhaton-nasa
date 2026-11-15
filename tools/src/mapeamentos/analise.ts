import { arred, hoje, somarDias } from "../core/calc";
import { resultado, type Fonte, type Local, type Resultado } from "../core/tipos";
import { acharCultura, CULTURAS, type Cultura } from "../conhecimento/culturas";
import { buscarZarcMunicipio, safraDaData } from "../fontes/zarc";
import { climaJanela, condicaoRecente } from "./clima";
import { janelaPlantio } from "./janela-plantio";
import { culturasRegiao, precosMercado, soloEstimado } from "./regiao";
import { relevo } from "./relevo";
import { avaliarSucessao, type Sinal } from "./rotacao";

/**
 * Pipelines compostas: rodam as ferramentas independentes em paralelo e montam um
 * pacote de evidências por cultura. Não decidem nada: o agente usa o pacote para
 * sugerir, explicando motivo, evidência, benefício, risco e lacunas.
 */

async function tentar<T>(p: Promise<T>): Promise<T | { erro: string }> {
  try {
    return await p;
  } catch (e) {
    return { erro: (e as Error).message };
  }
}
const ok = <T>(x: T | { erro: string }): x is T => !(x as any)?.erro;

export interface EntradaPlantio {
  cultura: string;
  dataPlantio?: string;
  /** Culturas anteriores, em ordem cronológica (a última é a atual). */
  historico?: string[];
  solo?: string;
}

function sinaisClima(c: Cultura, clima: Awaited<ReturnType<typeof climaJanela>>): Sinal[] {
  const s: Sinal[] = [];
  const chuva = clima.dados.chuva.totalMm ?? 0;
  const [aMin, aMax] = c.aguaCicloMm;
  if (chuva < aMin * 0.8) s.push({ tipo: "atencao", texto: `Chuva esperada no ciclo (${chuva} mm) abaixo da necessidade típica de ${c.nome} (${aMin}–${aMax} mm).` });
  else if (chuva > aMax * 1.4 && c.toleranciaExcessoAgua === "baixa")
    s.push({ tipo: "atencao", texto: `Chuva esperada (${chuva} mm) bem acima da necessidade de ${c.nome}, que tolera mal o excesso de água (doenças, perda na colheita).` });
  else if (chuva > aMax)
    s.push({ tipo: "favoravel", texto: `Chuva esperada no ciclo (${chuva} mm) cobre a necessidade de ${c.nome} (${aMin}–${aMax} mm), com sobra; atenção a doenças em períodos muito úmidos.` });
  else s.push({ tipo: "favoravel", texto: `Chuva esperada no ciclo (${chuva} mm) dentro da necessidade típica de ${c.nome} (${aMin}–${aMax} mm).` });

  const classe = clima.dados.chuva.classificacao ?? "";
  const sazonal = classe.startsWith("tendência") ? " (pela previsão sazonal, sem correção de viés)" : "";
  if (classe.includes("abaixo do normal")) s.push({ tipo: "atencao", texto: `A chuva da janela tende a ficar abaixo do normal da região${sazonal}.` });
  if (classe.includes("acima do normal")) s.push({ tipo: c.toleranciaExcessoAgua === "baixa" ? "atencao" : "favoravel", texto: `A chuva da janela tende a ficar acima do normal da região${sazonal}.` });

  const calor = clima.dados.calor;
  const diasCalor = calor.diasPrevistosAcimaLimiar.length + (calor.diasSazonaisAcimaLimiar_media ?? 0);
  if (diasCalor >= 5 || (calor.historico.mediaDiasPorAno ?? 0) >= 10)
    s.push({ tipo: "atencao", texto: `Calor: cerca de ${arred(Math.max(diasCalor, calor.historico.mediaDiasPorAno ?? 0), 0)} dia(s) com máxima ≥ ${calor.limiar} °C no ciclo (limite de estresse de ${c.nome}).` });
  else s.push({ tipo: "favoravel", texto: `Poucos dias de calor acima do limite de ${c.nome} (${calor.limiar} °C) são esperados no ciclo.` });

  const g = clima.dados.geada;
  const freq = g.historico.frequencia ?? 0;
  if (c.sensibilidadeGeada !== "baixa" && (g.diasPrevistosComRisco.length || (g.probabilidadeSazonal ?? 0) >= 0.2 || freq >= 0.2))
    s.push({ tipo: "atencao", texto: `Geada: risco em ${Math.round(freq * 100)}% dos anos nesta janela${g.probabilidadeSazonal != null ? ` e em ${Math.round(g.probabilidadeSazonal * 100)}% dos cenários sazonais` : ""}; ${c.nome} tem sensibilidade ${c.sensibilidadeGeada}.` });
  else if (freq < 0.1) s.push({ tipo: "favoravel", texto: "Risco de geada baixo na janela do ciclo." });
  return s;
}

export async function analisarPlantio(local: Local, e: EntradaPlantio) {
  const cultura = acharCultura(e.cultura);
  const data = e.dataPlantio ?? hoje();
  const ciclo = cultura?.cicloDias[1] ?? 120;
  const periodo = { inicio: data, fim: somarDias(data, Math.min(ciclo, 365)) };

  const [clima, zarc, mercado, regiao, solo, recente, terreno] = await Promise.all([
    tentar(climaJanela(local, periodo, cultura?.limiteCalor ?? 34)),
    tentar(janelaPlantio(local, e.cultura, data, e.solo)),
    tentar(precosMercado(e.cultura, local)),
    tentar(culturasRegiao(local)),
    tentar(soloEstimado(local)),
    tentar(condicaoRecente(local)),
    tentar(relevo(local)),
  ]);
  const rotacao = e.historico?.length ? avaliarSucessao(e.historico, e.cultura) : null;

  const sinais: Sinal[] = [];
  if (cultura && ok(clima)) sinais.push(...sinaisClima(cultura, clima));
  if (ok(zarc)) {
    const avs = (zarc.dados as any).avaliacoes as any[] | undefined;
    if (!avs) sinais.push({ tipo: "atencao", texto: `${cultura?.nome ?? e.cultura} não é zoneada pelo ZARC no município.` });
    else if (avs.some((a) => a.indicadoNaData)) {
      const r = Math.min(...avs.filter((a) => a.indicadoNaData).map((a) => a.menorRiscoNaData));
      sinais.push({ tipo: r <= 20 ? "favoravel" : "atencao", texto: `ZARC indica o plantio nesta data, com risco mínimo de ${r}%.` });
    } else sinais.push({ tipo: "atencao", texto: `ZARC não indica o plantio nesta data; próximo período indicado: ${avs[0]?.proximosDecendiosIndicados?.[0]?.periodo ?? "nenhum"}.` });
  }
  if (ok(mercado)) {
    for (const item of mercado.dados.itens) {
      const t = item.tendencia;
      const quem = mercado.dados.itens.length > 1 ? ` (${item.produto})` : "";
      if (t.direcao === "alta") sinais.push({ tipo: "favoravel", texto: `Preço recebido no PR${quem} em alta nos últimos 3 meses (${t.media3mVsAnteriorPct}%).` });
      if (t.direcao === "queda") sinais.push({ tipo: "atencao", texto: `Preço recebido no PR${quem} em queda nos últimos 3 meses (${t.media3mVsAnteriorPct}%).` });
    }
  }
  if (ok(regiao) && cultura) {
    const nomes = cultura.nomes.sidra ?? [];
    const pos = regiao.dados.culturas.findIndex((c) => nomes.includes(c.produto));
    if (pos >= 0 && pos < 4) sinais.push({ tipo: "favoravel", texto: `${cultura.nome} é uma das principais culturas do município (${regiao.dados.culturas[pos]!.participacaoPct}% da área), com estrutura de compra e assistência na região.` });
    else if (pos < 0) sinais.push({ tipo: "atencao", texto: `${cultura.nome} não aparece entre as culturas colhidas no município: logística e venda precisam ser checadas.` });
  }
  if (rotacao) sinais.push(...rotacao.sinais);
  if (ok(terreno) && local.precisao === "talhao") {
    if (terreno.dados.posicao === "baixada" && cultura?.sensibilidadeGeada !== "baixa")
      sinais.push({ tipo: "atencao", texto: "Talhão em baixada: acumula ar frio e tem mais geada que a média regional." });
    if ((terreno.dados.declividadePct ?? 0) >= 8)
      sinais.push({ tipo: cultura?.beneficios.some((b) => /palhada|cobertura/.test(b)) ? "favoravel" : "atencao", texto: `Terreno ${terreno.dados.classeDeclividade} (${terreno.dados.declividadePct}%): erosão é uma preocupação; palhada e plantio em nível ajudam.` });
  }

  const partes = { clima, zarc, mercado, regiao, solo, recente, relevo: terreno };
  const lacunas = [
    ...Object.entries(partes).filter(([, v]) => !ok(v)).map(([k, v]) => `Fonte indisponível (${k}): ${(v as any).erro}`),
    ...(rotacao?.lacunas ?? []),
    ...(!e.historico?.length ? ["Histórico de plantio da área não informado: rotação não avaliada."] : []),
    "Análise de solo do talhão não informada: fertilidade e correção não avaliadas.",
    "Preço pré-fixado da cooperativa não informado.",
  ];
  const fontes: Fonte[] = Object.values(partes).filter(ok).flatMap((r) => (r as Resultado<unknown>).fontes);
  const unicas = [...new Map(fontes.map((f) => [f.nome, f])).values()];
  const resumo = [
    `Análise de ${cultura?.nome ?? e.cultura} plantada em ${data} (ciclo até ${periodo.fim}) em ${local.municipio ?? "local informado"}.`,
    ...sinais.map((s) => `${s.tipo === "favoravel" ? "A favor" : "Atenção"}: ${s.texto}`),
  ];
  return resultado("analisar_plantio", {
    local,
    periodo,
    resumo,
    dados: {
      cultura: cultura?.nome ?? e.cultura,
      dataPlantio: data,
      sinais,
      placar: { favoraveis: sinais.filter((s) => s.tipo === "favoravel").length, atencao: sinais.filter((s) => s.tipo === "atencao").length },
      evidencias: Object.fromEntries(Object.entries(partes).map(([k, v]) => [k, ok(v) ? { resumo: (v as Resultado<unknown>).resumo, limitacoes: (v as Resultado<unknown>).limitacoes } : v])),
      detalhes: { clima: ok(clima) ? clima.dados : null, zarc: ok(zarc) ? zarc.dados : null, mercado: ok(mercado) ? mercado.dados : null },
    },
    fontes: unicas,
    limitacoes: lacunas,
  });
}

/**
 * Compara a estratégia atual/pretendida com alternativas (mínimo 3 estratégias no total,
 * como pede o desafio). Se não vierem alternativas, escolhe entre as culturas zoneadas pelo
 * ZARC e indicadas na data, priorizando famílias diferentes da cultura anterior.
 */
export async function compararEstrategias(local: Local, e: EntradaPlantio & { alternativas?: string[] }) {
  const data = e.dataPlantio ?? hoje();
  let alternativas = e.alternativas ?? [];
  const escolhaAutomatica = !alternativas.length;
  if (escolhaAutomatica && local.ibge) {
    const linhas = await buscarZarcMunicipio(local.ibge, safraDaData(data)).catch(() => []);
    const { decendio } = await import("../core/calc");
    const dec = decendio(data);
    const anterior = acharCultura(e.historico?.at(-1) ?? "");
    const proposta = acharCultura(e.cultura);
    const candidatas = CULTURAS.filter((c) => c.id !== proposta?.id && c.nomes.zarc)
      .map((c) => {
        const ls = linhas.filter((l) => c.nomes.zarc!.includes(l.cultura) && l.manejo === "Sequeiro");
        const riscos = ls.map((l) => l.risco[dec - 1] ?? 0).filter((r) => r > 0);
        return { c, risco: riscos.length ? Math.min(...riscos) : 0 };
      })
      .filter((x) => x.risco > 0)
      .sort((a, b) => {
        const fa = anterior && a.c.familia === anterior.familia ? 1 : 0;
        const fb = anterior && b.c.familia === anterior.familia ? 1 : 0;
        return fa - fb || a.risco - b.risco;
      });
    alternativas = candidatas.slice(0, 2).map((x) => x.c.id);
  }
  const estrategias = [e.cultura, ...alternativas.filter((a) => acharCultura(a)?.id !== acharCultura(e.cultura)?.id)];
  const analises = await Promise.all(estrategias.map((c) => analisarPlantio(local, { ...e, cultura: c, dataPlantio: data })));
  const quadro = analises.map((a, i) => ({
    estrategia: i === 0 ? "pretendida/atual" : `alternativa ${i}`,
    cultura: a.dados.cultura,
    favoraveis: a.dados.placar.favoraveis,
    atencao: a.dados.placar.atencao,
    sinais: a.dados.sinais,
  }));
  return resultado("comparar_estrategias", {
    local,
    periodo: analises[0]?.periodo,
    resumo: [
      `Comparação para plantio em ${data}: ${quadro.map((q) => `${q.cultura} (${q.favoraveis} a favor, ${q.atencao} de atenção)`).join(" · ")}.`,
      ...(escolhaAutomatica ? ["Alternativas escolhidas entre as culturas indicadas pelo ZARC na data, priorizando família diferente da cultura anterior."] : []),
    ],
    dados: { dataPlantio: data, quadro, analises: analises.map((a) => ({ cultura: a.dados.cultura, resumo: a.resumo, limitacoes: a.limitacoes, evidencias: a.dados.evidencias })) },
    fontes: [...new Map(analises.flatMap((a) => a.fontes).map((f) => [f.nome, f])).values()],
    limitacoes: [
      "A contagem de sinais é só um apoio de leitura, não uma nota: um único ponto de atenção (ex.: fora do ZARC) pode pesar mais que vários favoráveis.",
      ...new Set(analises.flatMap((a) => a.limitacoes)),
    ],
  });
}
