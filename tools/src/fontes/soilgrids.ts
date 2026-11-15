import { buscarJson, TTL } from "../core/http";
import type { Fonte } from "../core/tipos";

/**
 * ISRIC SoilGrids 2.0 — https://rest.isric.org/soilgrids/v2.0/docs — sem chave.
 * Estimativa por modelo (aprendizado de máquina sobre perfis de solo), 250 m.
 * API em beta e frequentemente lenta (504). Áreas urbanas retornam null.
 * Não substitui a análise de solo do produtor.
 */
export const FONTE_SOILGRIDS: Fonte = {
  nome: "ISRIC SoilGrids 2.0",
  url: "https://soilgrids.org/",
  resolucao: "250 m",
  tipo: "estimativa",
};

export interface CamadaSolo {
  propriedade: string;
  profundidade: string;
  unidade: string;
  media: number | null;
  q05: number | null;
  q95: number | null;
}

/** Converte para a unidade final (`target_units`) dividindo pelo `d_factor`. */
export function parseSoilGrids(json: any): CamadaSolo[] {
  const out: CamadaSolo[] = [];
  for (const camada of json?.properties?.layers ?? []) {
    const f = camada.unit_measure?.d_factor ?? 1;
    const conv = (v: number | null | undefined) => (v == null ? null : v / f);
    for (const p of camada.depths) {
      out.push({
        propriedade: camada.name,
        profundidade: p.label,
        unidade: camada.unit_measure?.target_units ?? camada.unit_measure?.mapped_units,
        media: conv(p.values.mean),
        q05: conv(p.values["Q0.05"]),
        q95: conv(p.values["Q0.95"]),
      });
    }
  }
  return out;
}

export const PROPRIEDADES_SOLO = ["clay", "sand", "silt", "phh2o", "soc", "nitrogen", "cec", "bdod"];

export async function buscarSoilGrids(lat: number, lon: number) {
  const props = PROPRIEDADES_SOLO.map((p) => `property=${p}`).join("&");
  const url =
    `https://rest.isric.org/soilgrids/v2.0/properties/query?lon=${lon.toFixed(4)}&lat=${lat.toFixed(4)}` +
    `&${props}&depth=0-5cm&depth=5-15cm&depth=15-30cm&value=mean&value=Q0.05&value=Q0.95`;
  return parseSoilGrids(await buscarJson("soilgrids", url, { ttl: TTL.estatico, timeoutMs: 120_000, tentativas: 3 }));
}
