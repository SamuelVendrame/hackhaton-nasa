import { buscarJson, TTL } from "../core/http";
import type { Fonte } from "../core/tipos";

/**
 * NASA POWER — https://power.larc.nasa.gov/docs/services/api/ — sem chave.
 * Grade ~0,5° x 0,625° (MERRA-2) e ~1° (radiação). Dados diários com atraso de poucos dias.
 * Parâmetros úteis (comunidade AG):
 *   T2M, T2M_MAX, T2M_MIN (°C) · PRECTOTCORR (mm/dia) · WS2M, WS10M (m/s) · RH2M (%)
 *   ALLSKY_SFC_SW_DWN (MJ/m²/dia) · GWETTOP, GWETROOT, GWETPROF (umidade do solo 0–1)
 *   EVPTRNS (evapotranspiração) · FROST_DAYS (só climatologia)
 */
export const FONTE_POWER: Fonte = {
  nome: "NASA POWER (MERRA-2/GEOS)",
  url: "https://power.larc.nasa.gov/",
  resolucao: "~50 km",
  tipo: "reanalise",
};

export type SerieDiaria = Record<string, Record<string, number | null>>; // parametro -> AAAAMMDD -> valor

export function parsePowerDiario(json: any): { serie: SerieDiaria; unidades: Record<string, string> } {
  const fill = json?.header?.fill_value ?? -999;
  const serie: SerieDiaria = {};
  for (const [p, valores] of Object.entries<Record<string, number>>(json.properties.parameter)) {
    serie[p] = {};
    for (const [d, v] of Object.entries(valores)) serie[p]![d] = v === fill || v == null ? null : v;
  }
  const unidades = Object.fromEntries(Object.entries<any>(json.parameters ?? {}).map(([k, v]) => [k, v.units]));
  return { serie, unidades };
}

const compacta = (iso: string) => iso.replaceAll("-", "");
export const expande = (d: string) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;

export async function buscarPowerDiario(lat: number, lon: number, inicio: string, fim: string, parametros: string[]) {
  const url =
    `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=${[...parametros].sort().join(",")}` +
    `&community=AG&longitude=${lon.toFixed(4)}&latitude=${lat.toFixed(4)}` +
    `&start=${compacta(inicio)}&end=${compacta(fim)}&format=JSON`;
  return parsePowerDiario(await buscarJson("nasa-power", url, { ttl: TTL.diario, timeoutMs: 120_000 }));
}

/**
 * Série histórica longa padrão (20 anos completos) para climatologia própria.
 * Usa sempre o mesmo intervalo e parâmetros, então todas as ferramentas compartilham o cache.
 */
export const PARAMS_HISTORICO = ["T2M_MAX", "T2M_MIN", "PRECTOTCORR", "WS2M", "GWETROOT", "GWETTOP", "RH2M"];

export function intervaloHistorico(anoAtual = new Date().getUTCFullYear()) {
  return { inicio: `${anoAtual - 20}-01-01`, fim: `${anoAtual - 1}-12-31` };
}

export async function buscarHistoricoPower(lat: number, lon: number) {
  const { inicio, fim } = intervaloHistorico();
  // Arredonda para a grade do POWER: pontos vizinhos reaproveitam o mesmo cache.
  const la = Math.round(lat * 2) / 2;
  const lo = Math.round(lon / 0.625) * 0.625;
  const r = await buscarPowerDiario(la, lo, inicio, fim, PARAMS_HISTORICO);
  return { ...r, inicio, fim };
}

export async function buscarClimatologiaPower(lat: number, lon: number, parametros: string[]) {
  const url =
    `https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=${parametros.join(",")}` +
    `&community=AG&longitude=${lon.toFixed(4)}&latitude=${lat.toFixed(4)}&format=JSON`;
  const json = await buscarJson("nasa-power", url, { ttl: TTL.estatico });
  return { parametros: json.properties.parameter as Record<string, Record<string, number>>, faixa: json.header?.range as string };
}
