import { buscarJson, TTL } from "../core/http";

/**
 * IBGE — sem chave.
 * - Localidades: https://servicodados.ibge.gov.br/api/docs/localidades
 * - SIDRA, tabela 5457 (Produção Agrícola Municipal, lavouras temporárias e permanentes):
 *   https://apisidra.ibge.gov.br/ — variáveis 214 (quantidade produzida, t), 216 (área colhida, ha),
 *   112 (rendimento médio, kg/ha), 215 (valor da produção, mil R$).
 */

export interface MunicipioIbge {
  id: number;
  nome: string;
  microrregiao?: { nome: string; mesorregiao: { nome: string; UF: { sigla: string } } };
  "regiao-imediata"?: { nome: string; "regiao-intermediaria": { nome: string; UF: { sigla: string } } };
}

export async function buscarMunicipio(ibge: string) {
  return buscarJson<MunicipioIbge>("ibge", `https://servicodados.ibge.gov.br/api/v1/localidades/municipios/${ibge}`, {
    ttl: TTL.estatico,
  });
}

/** Busca por nome + UF, para quando só se conhece o nome. */
export async function buscarMunicipioPorNome(nome: string, uf: string) {
  const lista = await buscarJson<MunicipioIbge[]>(
    "ibge",
    `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios`,
    { ttl: TTL.estatico },
  );
  const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  return lista.find((m) => norm(m.nome) === norm(nome)) ?? null;
}

/** Malha do município (GeoJSON) para obter o centroide quando não há coordenada. */
export async function buscarMalhaMunicipio(ibge: string) {
  return buscarJson<any>(
    "ibge",
    `https://servicodados.ibge.gov.br/api/v3/malhas/municipios/${ibge}?formato=application/vnd.geo+json`,
    { ttl: TTL.estatico },
  );
}

/** Centroide simples (média dos vértices do maior anel), suficiente para dados em grade de km. */
export function centroideGeoJson(geo: any): { lat: number; lon: number } | null {
  const feats = geo?.features ?? (geo?.type === "Feature" ? [geo] : []);
  let melhor: number[][] = [];
  for (const f of feats) {
    const g = f.geometry;
    const poligonos = g?.type === "Polygon" ? [g.coordinates] : g?.type === "MultiPolygon" ? g.coordinates : [];
    for (const p of poligonos) if (p[0]?.length > melhor.length) melhor = p[0];
  }
  if (!melhor.length) return null;
  const lon = melhor.reduce((a, c) => a + c[0]!, 0) / melhor.length;
  const lat = melhor.reduce((a, c) => a + c[1]!, 0) / melhor.length;
  return { lat, lon };
}

export interface LinhaPam {
  ano: number;
  produto: string;
  variavel: "producao_t" | "area_colhida_ha" | "rendimento_kg_ha" | "valor_mil_reais";
  valor: number | null;
}

const VARIAVEIS: Record<string, LinhaPam["variavel"]> = {
  "214": "producao_t",
  "216": "area_colhida_ha",
  "112": "rendimento_kg_ha",
  "215": "valor_mil_reais",
};

/** Converte a resposta "values" do SIDRA (1ª linha = cabeçalho) em linhas tipadas. */
export function parsePam(resposta: any[]): LinhaPam[] {
  return resposta.slice(1).map((r) => {
    const v = Number(r.V);
    return {
      ano: Number(r.D3C),
      // Produtos com "*" no nome são os de unidade alterada pelo IBGE; mantemos o nome limpo.
      produto: String(r.D4N).replace(/\*$/, "").trim(),
      variavel: VARIAVEIS[r.D2C] ?? (r.D2C as any),
      // "-" = zero absoluto, "..." / "X" = não disponível ou sigilo.
      valor: r.V === "-" ? 0 : Number.isFinite(v) ? v : null,
    };
  });
}

/** PAM do município para os últimos `anos` anos disponíveis. */
export async function buscarPam(ibge: string, anos = 1) {
  const url = `https://apisidra.ibge.gov.br/values/t/5457/n6/${ibge}/v/112,214,215,216/p/last%20${anos}/c782/allxt?formato=json`;
  return parsePam(await buscarJson<any[]>("ibge-sidra", url, { ttl: TTL.estatico, timeoutMs: 90_000 }));
}

/* ------------------------- Município a partir da coordenada ------------------------- */

type Anel = [number, number][];

/** Ponto dentro de polígono (ray casting), considerando buracos. */
export function pontoNoPoligono(lon: number, lat: number, aneis: Anel[]): boolean {
  let dentro = false;
  for (const anel of aneis) {
    for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
      const [xi, yi] = anel[i]!;
      const [xj, yj] = anel[j]!;
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dentro = !dentro;
    }
  }
  return dentro;
}

export function feicaoQueContem(geo: any, lat: number, lon: number): string | null {
  for (const f of geo?.features ?? []) {
    const g = f.geometry;
    const poligonos: Anel[][] = g?.type === "Polygon" ? [g.coordinates] : g?.type === "MultiPolygon" ? g.coordinates : [];
    if (poligonos.some((p) => pontoNoPoligono(lon, lat, p))) return String(f.properties?.codarea ?? "");
  }
  return null;
}

/**
 * Código IBGE do município que contém o ponto: primeiro acha a UF na malha do Brasil,
 * depois o município na malha da UF (malhas em qualidade mínima, em cache por 30 dias).
 */
export async function municipioPorCoordenada(lat: number, lon: number): Promise<string | null> {
  const base = "https://servicodados.ibge.gov.br/api/v3/malhas";
  const q = "formato=application/vnd.geo%2Bjson&qualidade=minima";
  const ufs = await buscarJson<any>("ibge", `${base}/paises/BR?intrarregiao=UF&${q}`, { ttl: TTL.estatico });
  const uf = feicaoQueContem(ufs, lat, lon);
  if (!uf) return null;
  const munis = await buscarJson<any>("ibge", `${base}/estados/${uf}?intrarregiao=municipio&${q}`, { ttl: TTL.estatico });
  return feicaoQueContem(munis, lat, lon);
}
