import { buscarJson, TTL } from "../core/http";
import type { Fonte } from "../core/tipos";

/**
 * Open-Meteo Elevation API (Copernicus DEM GLO-90, ~90 m) — sem chave.
 * https://open-meteo.com/en/docs/elevation-api — aceita até 100 coordenadas por chamada.
 * Alternativa NASA (SRTM via OpenTopography/Earthdata) exige conta; o DEM Copernicus tem qualidade equivalente.
 */
export const FONTE_ELEVACAO: Fonte = {
  nome: "Copernicus DEM GLO-90 (via Open-Meteo)",
  url: "https://open-meteo.com/en/docs/elevation-api",
  resolucao: "~90 m",
  tipo: "observacao",
};

export async function buscarElevacoes(pontos: { lat: number; lon: number }[]): Promise<number[]> {
  const lat = pontos.map((p) => p.lat.toFixed(5)).join(",");
  const lon = pontos.map((p) => p.lon.toFixed(5)).join(",");
  const r = await buscarJson<{ elevation: number[] }>("elevacao", `https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`, {
    ttl: TTL.estatico,
  });
  return r.elevation;
}
