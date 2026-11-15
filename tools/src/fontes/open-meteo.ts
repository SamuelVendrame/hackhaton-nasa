import { media, percentil } from "../core/calc";
import { buscarJson, TTL } from "../core/http";
import type { DiaClima, Fonte } from "../core/tipos";

/**
 * Open-Meteo — https://open-meteo.com/en/docs — sem chave (uso não comercial; plano pago para uso comercial).
 * - forecast: até 16 dias, modelos combinados (best match), grade ~2–11 km.
 * - seasonal: até ~7 meses, ECMWF SEAS5 com vários membros (ensemble).
 * - archive: histórico ERA5/ERA5-Land desde 1940.
 */
export const FONTE_PREVISAO: Fonte = {
  nome: "Open-Meteo Forecast (melhor combinação de modelos)",
  url: "https://open-meteo.com/en/docs",
  resolucao: "~2–11 km",
  tipo: "previsao",
};
export const FONTE_SAZONAL: Fonte = {
  nome: "Open-Meteo Seasonal (ECMWF SEAS5, ensemble)",
  url: "https://open-meteo.com/en/docs/seasonal-forecast-api",
  resolucao: "~36 km",
  tipo: "previsao_sazonal",
};

const DIARIO_PREVISAO = [
  "temperature_2m_max",
  "temperature_2m_min",
  "precipitation_sum",
  "precipitation_probability_max",
  "wind_speed_10m_max",
  "wind_gusts_10m_max",
  "et0_fao_evapotranspiration",
  "relative_humidity_2m_mean",
];

export interface PrevisaoDia extends DiaClima {
  probChuva: number | null;
  et0: number | null;
  umidadeRel: number | null;
}

export function parsePrevisao(json: any): PrevisaoDia[] {
  const d = json.daily;
  return d.time.map((t: string, i: number) => ({
    data: t,
    tmin: d.temperature_2m_min?.[i] ?? null,
    tmax: d.temperature_2m_max?.[i] ?? null,
    chuva: d.precipitation_sum?.[i] ?? null,
    vento: d.wind_speed_10m_max?.[i] ?? null,
    rajada: d.wind_gusts_10m_max?.[i] ?? null,
    probChuva: d.precipitation_probability_max?.[i] ?? null,
    et0: d.et0_fao_evapotranspiration?.[i] ?? null,
    umidadeRel: d.relative_humidity_2m_mean?.[i] ?? null,
    origem: "previsao" as const,
  }));
}

/** Umidade do solo horária prevista → média diária por camada (m³/m³). */
export function parseUmidadeSoloPrevista(json: any) {
  const h = json.hourly;
  if (!h?.time) return [];
  const porDia = new Map<string, { s0: number[]; s1: number[]; s3: number[] }>();
  h.time.forEach((t: string, i: number) => {
    const dia = t.slice(0, 10);
    const reg = porDia.get(dia) ?? { s0: [], s1: [], s3: [] };
    if (h.soil_moisture_0_to_1cm?.[i] != null) reg.s0.push(h.soil_moisture_0_to_1cm[i]);
    if (h.soil_moisture_3_to_9cm?.[i] != null) reg.s1.push(h.soil_moisture_3_to_9cm[i]);
    if (h.soil_moisture_27_to_81cm?.[i] != null) reg.s3.push(h.soil_moisture_27_to_81cm[i]);
    porDia.set(dia, reg);
  });
  return [...porDia].map(([data, r]) => ({
    data,
    superficie_0_1cm: media(r.s0),
    raso_3_9cm: media(r.s1),
    raiz_27_81cm: media(r.s3),
  }));
}

export async function buscarPrevisao(lat: number, lon: number, dias = 16) {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
    `&daily=${DIARIO_PREVISAO.join(",")}&hourly=soil_moisture_0_to_1cm,soil_moisture_3_to_9cm,soil_moisture_27_to_81cm` +
    `&forecast_days=${dias}&timezone=America%2FSao_Paulo`;
  const json = await buscarJson("open-meteo", url, { ttl: TTL.previsao });
  return { dias: parsePrevisao(json), umidadeSolo: parseUmidadeSoloPrevista(json) };
}

/**
 * Previsão sazonal: resume os membros do ensemble em média e percentis 10/90 por dia.
 * Valores isolados de um dia têm pouca habilidade; use acumulados/médias por semana ou mês.
 */
export function parseSazonal(json: any): DiaClima[] {
  const d = json.daily;
  const membros = (base: string) => Object.keys(d).filter((k) => k === base || k.startsWith(`${base}_member`));
  const chaves = {
    tmin: membros("temperature_2m_min"),
    tmax: membros("temperature_2m_max"),
    chuva: membros("precipitation_sum"),
  };
  return d.time.map((t: string, i: number) => {
    const valores = (ks: string[]) => ks.map((k) => d[k]?.[i] as number | null);
    const tmin = valores(chaves.tmin);
    const tmax = valores(chaves.tmax);
    const chuva = valores(chaves.chuva);
    return {
      data: t,
      tmin: media(tmin),
      tmax: media(tmax),
      chuva: media(chuva),
      chuvaP10: percentil(chuva, 0.1),
      chuvaP90: percentil(chuva, 0.9),
      tminP10: percentil(tmin, 0.1),
      tmaxP90: percentil(tmax, 0.9),
      membros: { tmin, tmax, chuva },
      origem: "previsao_sazonal" as const,
    };
  });
}

export async function buscarSazonal(lat: number, lon: number, dias = 210) {
  const url =
    `https://seasonal-api.open-meteo.com/v1/seasonal?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&forecast_days=${dias}&timezone=America%2FSao_Paulo`;
  return parseSazonal(await buscarJson("open-meteo-seasonal", url, { ttl: TTL.diario, timeoutMs: 90_000 }));
}
