import { arred, hoje, somarDias } from "../core/calc";
import { resultado, type Local } from "../core/tipos";
import { acharCultura } from "../conhecimento/culturas";
import { climaJanela, condicaoRecente, ventoPrevisto } from "./clima";

/**
 * Monitoramento assíncrono de plantios (planejados ou em andamento).
 * Um job periódico chama `fotografarPlantio`, guarda a foto e compara com a anterior
 * usando `compararFotos`; os alertas viram notificação no app/WhatsApp.
 */

export interface Plantio {
  id: string;
  local: Local;
  cultura: string;
  dataPlantio: string;
  /** Opcional: fim do ciclo; senão usa o ciclo máximo da ficha da cultura. */
  dataColheita?: string;
}

export interface Foto {
  plantioId: string;
  tiradaEm: string;
  periodo: { inicio: string; fim: string };
  chuvaTotalMm: number | null;
  chuvaClasse: string | null;
  diasGeadaPrevistos: string[];
  probGeadaSazonal: number | null;
  diasCalorPrevistos: string[];
  diasChuvaForte: string[];
  rajadasFortes: string[];
  maiorSequenciaSeca: number;
}

export async function fotografarPlantio(p: Plantio): Promise<Foto> {
  const c = acharCultura(p.cultura);
  // Monitora do maior entre hoje e o plantio até a colheita.
  const inicio = p.dataPlantio > hoje() ? p.dataPlantio : hoje();
  const fim = p.dataColheita ?? somarDias(p.dataPlantio, c?.cicloDias[1] ?? 120);
  const [clima, vento] = await Promise.all([
    climaJanela(p.local, { inicio, fim }, c?.limiteCalor ?? 34),
    ventoPrevisto(p.local).catch(() => null),
  ]);
  const d = clima.dados;
  return {
    plantioId: p.id,
    tiradaEm: new Date().toISOString(),
    periodo: { inicio, fim },
    chuvaTotalMm: d.chuva.totalMm,
    chuvaClasse: d.chuva.classificacao,
    diasGeadaPrevistos: d.geada.diasPrevistosComRisco.map((x) => x.data),
    probGeadaSazonal: d.geada.probabilidadeSazonal,
    diasCalorPrevistos: d.calor.diasPrevistosAcimaLimiar.map((x) => x.data),
    diasChuvaForte: d.chuva.diasChuvaForte.map((x) => x.data),
    rajadasFortes: (vento?.dados.diasRajadaForte ?? []).filter((x) => x.data >= inicio && x.data <= fim).map((x) => x.data),
    maiorSequenciaSeca: d.chuva.maiorSequenciaSecaPrevista,
  };
}

export interface Alerta {
  severidade: "info" | "atencao" | "alerta";
  tipo: "geada" | "calor" | "chuva" | "seca" | "vento";
  texto: string;
}

/** Diferenças relevantes entre duas fotos do mesmo plantio. Função pura. */
export function compararFotos(antes: Foto | null, agora: Foto): Alerta[] {
  const novos = (a: string[] = [], b: string[]) => b.filter((x) => !a.includes(x));
  const alertas: Alerta[] = [];
  const geada = novos(antes?.diasGeadaPrevistos, agora.diasGeadaPrevistos);
  if (geada.length) alertas.push({ severidade: "alerta", tipo: "geada", texto: `Nova previsão de risco de geada em ${geada.join(", ")}.` });
  const forte = novos(antes?.diasChuvaForte, agora.diasChuvaForte);
  if (forte.length) alertas.push({ severidade: "atencao", tipo: "chuva", texto: `Chuva forte (≥ 50 mm) prevista em ${forte.join(", ")}.` });
  const calor = novos(antes?.diasCalorPrevistos, agora.diasCalorPrevistos);
  if (calor.length) alertas.push({ severidade: "atencao", tipo: "calor", texto: `Calor acima do limite da cultura previsto em ${calor.join(", ")}.` });
  const vento = novos(antes?.rajadasFortes, agora.rajadasFortes);
  if (vento.length) alertas.push({ severidade: "atencao", tipo: "vento", texto: `Rajadas fortes previstas em ${vento.join(", ")}.` });
  if (antes && antes.chuvaClasse !== agora.chuvaClasse && agora.chuvaClasse)
    alertas.push({
      severidade: agora.chuvaClasse === "dentro do normal" ? "info" : "atencao",
      tipo: "chuva",
      texto: `A expectativa de chuva no ciclo mudou de "${antes.chuvaClasse}" para "${agora.chuvaClasse}" (${antes.chuvaTotalMm} → ${agora.chuvaTotalMm} mm).`,
    });
  if (antes && antes.probGeadaSazonal != null && agora.probGeadaSazonal != null && agora.probGeadaSazonal - antes.probGeadaSazonal >= 0.15)
    alertas.push({ severidade: "atencao", tipo: "geada", texto: `Probabilidade sazonal de geada subiu de ${Math.round(antes.probGeadaSazonal * 100)}% para ${Math.round(agora.probGeadaSazonal * 100)}%.` });
  if (agora.maiorSequenciaSeca >= 10 && (antes?.maiorSequenciaSeca ?? 0) < 10)
    alertas.push({ severidade: "atencao", tipo: "seca", texto: `Previsão de ${agora.maiorSequenciaSeca} dias seguidos sem chuva.` });
  return alertas;
}

export async function monitorarPlantio(p: Plantio, fotoAnterior: Foto | null = null) {
  const foto = await fotografarPlantio(p);
  const alertas = compararFotos(fotoAnterior, foto);
  return resultado("monitorar_plantio", {
    local: p.local,
    periodo: foto.periodo,
    resumo: alertas.length ? alertas.map((a) => `[${a.severidade}] ${a.texto}`) : ["Sem mudanças relevantes no cenário do plantio desde a última verificação."],
    dados: { foto, alertas },
    fontes: [],
    limitacoes: ["Guarde `dados.foto` e envie como `fotoAnterior` na próxima execução para detectar mudanças."],
  });
}

/** Conteúdo dos disparos periódicos do WhatsApp: próximos 7 dias (semanal) ou 30 dias (mensal). */
export async function resumoPeriodico(local: Local, tipo: "semanal" | "mensal" = "semanal") {
  const inicio = hoje();
  const fim = somarDias(inicio, tipo === "semanal" ? 6 : 29);
  const [clima, recente, vento] = await Promise.all([
    climaJanela(local, { inicio, fim }),
    condicaoRecente(local).catch(() => null),
    ventoPrevisto(local).catch(() => null),
  ]);
  const d = clima.dados;
  const destaques: string[] = [];
  if (d.geada.diasPrevistosComRisco.length) destaques.push(`risco de geada em ${d.geada.diasPrevistosComRisco.map((x) => x.data).join(", ")}`);
  if (d.chuva.diasChuvaForte.length) destaques.push(`chuva forte em ${d.chuva.diasChuvaForte.map((x) => x.data).join(", ")}`);
  if (d.calor.diasPrevistosAcimaLimiar.length) destaques.push(`${d.calor.diasPrevistosAcimaLimiar.length} dia(s) de calor ≥ ${d.calor.limiar} °C`);
  if (d.chuva.maiorSequenciaSecaPrevista >= 7) destaques.push(`${d.chuva.maiorSequenciaSecaPrevista} dias seguidos sem chuva`);
  const rajadas = vento?.dados.diasRajadaForte.filter((x) => x.data <= fim) ?? [];
  if (rajadas.length) destaques.push(`rajadas fortes em ${rajadas.map((x) => x.data).join(", ")}`);
  return resultado("resumo_periodico", {
    local,
    periodo: { inicio, fim },
    resumo: [
      `Próximos ${tipo === "semanal" ? "7" : "30"} dias: ${d.chuva.totalMm} mm de chuva (${d.chuva.classificacao}), mínimas médias de ${d.temperatura.minimaMedia} °C e máximas de ${d.temperatura.maximaMedia} °C.`,
      destaques.length ? `Destaques: ${destaques.join("; ")}.` : "Sem eventos extremos previstos.",
      ...(recente ? [recente.resumo[0]!] : []),
    ],
    dados: { tipo, semanas: d.semanas, destaques, temperatura: d.temperatura, chuva: { totalMm: d.chuva.totalMm, classe: d.chuva.classificacao, anomaliaPct: arred(d.chuva.anomaliaPct, 0) } },
    fontes: clima.fontes,
    limitacoes: clima.limitacoes,
  });
}
