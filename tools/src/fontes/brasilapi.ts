import { buscarJson, ErroFonte, TTL } from "../core/http";
import type { Local } from "../core/tipos";

/** BrasilAPI CEP v2: https://brasilapi.com.br/docs#tag/CEP-V2 — sem chave. */
export interface CepV2 {
  cep: string;
  state: string;
  city: string;
  neighborhood?: string;
  street?: string;
  service: string;
  ibge?: { city: string; state: string };
  location?: { type: string; coordinates: { latitude?: string; longitude?: string } };
}

export function cepParaLocal(c: CepV2): Partial<Local> & { temCoordenada: boolean } {
  const lat = Number(c.location?.coordinates?.latitude);
  const lon = Number(c.location?.coordinates?.longitude);
  const temCoordenada = Number.isFinite(lat) && Number.isFinite(lon) && c.location?.coordinates?.latitude != null;
  return {
    cep: c.cep,
    municipio: c.city,
    uf: c.state,
    ibge: c.ibge?.city,
    ...(temCoordenada ? { lat, lon } : {}),
    temCoordenada,
  };
}

export async function buscarCep(cep: string): Promise<CepV2> {
  const limpo = cep.replace(/\D/g, "");
  if (limpo.length !== 8) throw new ErroFonte("brasilapi", `CEP inválido: ${cep}`);
  return buscarJson<CepV2>("brasilapi", `https://brasilapi.com.br/api/cep/v2/${limpo}`, { ttl: TTL.estatico, tentativas: 2 });
}
