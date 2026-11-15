import { buscarJson, ErroFonte, TTL } from "../core/http";
import { diasEntre, hoje, iso } from "../core/calc";
import type { Fonte } from "../core/tipos";

/**
 * MODIS MOD13Q1 (Terra, NDVI/EVI de 16 dias, 250 m) pelo serviço web do ORNL DAAC.
 * https://modis.ornl.gov/data/modis_webservice.html — sem chave.
 * Limite do serviço: até 10 datas de composição por requisição.
 */
export const FONTE_MODIS: Fonte = {
  nome: "NASA MODIS MOD13Q1 (NDVI/EVI 16 dias) via ORNL DAAC",
  url: "https://modis.ornl.gov/",
  resolucao: "250 m",
  tipo: "observacao",
};

export interface Composicao {
  /** Data de início da composição de 16 dias. */
  data: string;
  ndvi: number | null;
  evi: number | null;
  /** 0 bom, 1 marginal, 2 neve, 3 nuvem, -1 sem dado. */
  confiabilidade: number | null;
}

const ESCALA = 0.0001;
const PREENCHIMENTO = -3000;

export function parseModis(json: any): Composicao[] {
  const porData = new Map<string, Composicao>();
  for (const s of json?.subset ?? []) {
    const c = porData.get(s.calendar_date) ?? { data: s.calendar_date, ndvi: null, evi: null, confiabilidade: null };
    const v = Array.isArray(s.data) ? s.data[0] : null;
    if (/NDVI$/.test(s.band)) c.ndvi = v == null || v <= PREENCHIMENTO ? null : v * ESCALA;
    else if (/EVI$/.test(s.band)) c.evi = v == null || v <= PREENCHIMENTO ? null : v * ESCALA;
    else if (/pixel_reliability$/.test(s.band)) c.confiabilidade = v;
    porData.set(s.calendar_date, c);
  }
  return [...porData.values()].sort((a, b) => a.data.localeCompare(b.data));
}

/** Datas de composição MOD13Q1 (dia do ano 1, 17, 33, ... 353) no intervalo, em formato "A{ano}{ddd}". */
export function datasModis(inicio: string, fim: string): { codigo: string; data: string }[] {
  const out: { codigo: string; data: string }[] = [];
  for (let ano = Number(inicio.slice(0, 4)); ano <= Number(fim.slice(0, 4)); ano++) {
    for (let doy = 1; doy <= 366; doy += 16) {
      const d = new Date(Date.UTC(ano, 0, doy));
      const data = iso(d);
      if (data < inicio || data > fim) continue;
      out.push({ codigo: `A${ano}${String(doy).padStart(3, "0")}`, data });
    }
  }
  return out;
}

/**
 * Busca as composições do intervalo em lotes pequenos (o serviço é lento, 30–90 s por pedido,
 * e devolve 502 com frequência), no máximo 2 pedidos ao mesmo tempo. Lotes que falham são
 * pulados e contados em `lotesComFalha`; dados antigos ficam em cache por 30 dias.
 */
export async function buscarModis(lat: number, lon: number, inicio: string, fim: string, tamanhoLote = 5) {
  const datas = datasModis(inicio, fim);
  const lotes: (typeof datas)[] = [];
  for (let i = 0; i < datas.length; i += tamanhoLote) lotes.push(datas.slice(i, i + tamanhoLote));
  const composicoes: Composicao[] = [];
  let lotesComFalha = 0;
  const fila = [...lotes];
  const trabalhador = async () => {
    for (let l = fila.shift(); l; l = fila.shift()) {
      const url =
        `https://modis.ornl.gov/rst/api/v1/MOD13Q1/subset?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
        `&startDate=${l[0]!.codigo}&endDate=${l.at(-1)!.codigo}&kmAboveBelow=0&kmLeftRight=0`;
      const recente = diasEntre(l.at(-1)!.data, hoje()) < 60;
      try {
        const j = await buscarJson("modis-ornl", url, {
          ttl: recente ? TTL.semanal : TTL.estatico,
          headers: { accept: "application/json" },
          timeoutMs: 150_000,
          tentativas: 3,
        });
        composicoes.push(...parseModis(j));
      } catch {
        lotesComFalha++;
      }
    }
  };
  await Promise.all([trabalhador(), trabalhador()]);
  if (lotes.length && lotesComFalha === lotes.length) throw new ErroFonte("modis-ornl", "serviço MODIS do ORNL indisponível (todas as tentativas falharam)");
  return { composicoes: composicoes.sort((a, b) => a.data.localeCompare(b.data)), lotesComFalha, lotes: lotes.length };
}
