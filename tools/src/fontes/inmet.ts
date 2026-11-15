import { distanciaKm } from "../core/calc";
import { buscarJson, ErroFonte, TTL } from "../core/http";
import type { Fonte } from "../core/tipos";

/**
 * INMET — API de estações — https://portal.inmet.gov.br/manual
 * - Lista de estações: sem chave.
 * - Dados das estações: exige token pessoal, solicitado por e-mail ao INMET
 *   (sem token a rota pública responde 204 sem conteúdo). Defina INMET_TOKEN no .env.
 * Observação: o curl do Git Bash sofre reset de conexão neste host; o fetch do Bun funciona.
 */
export const FONTE_INMET: Fonte = {
  nome: "INMET — Estações meteorológicas",
  url: "https://portal.inmet.gov.br/",
  tipo: "observacao",
};

export interface Estacao {
  codigo: string;
  nome: string;
  uf: string;
  situacao: string;
  lat: number;
  lon: number;
  altitude: number;
  inicio: string;
  distanciaKm?: number;
}

export function parseEstacoes(json: any[]): Estacao[] {
  return json.map((s) => ({
    codigo: s.CD_ESTACAO,
    nome: s.DC_NOME,
    uf: s.SG_ESTADO,
    situacao: s.CD_SITUACAO,
    lat: Number(s.VL_LATITUDE),
    lon: Number(s.VL_LONGITUDE),
    altitude: Number(s.VL_ALTITUDE),
    inicio: String(s.DT_INICIO_OPERACAO ?? "").slice(0, 10),
  }));
}

export async function buscarEstacoes() {
  return parseEstacoes(await buscarJson<any[]>("inmet", "https://apitempo.inmet.gov.br/estacoes/T", { ttl: TTL.semanal }));
}

export function estacoesProximas(estacoes: Estacao[], lat: number, lon: number, n = 3, soOperantes = true) {
  return estacoes
    .filter((e) => !soOperantes || e.situacao === "Operante")
    .map((e) => ({ ...e, distanciaKm: Math.round(distanciaKm(lat, lon, e.lat, e.lon)) }))
    .sort((a, b) => a.distanciaKm! - b.distanciaKm!)
    .slice(0, n);
}

/** Dados horários de uma estação. Requer INMET_TOKEN. */
export async function buscarDadosEstacao(codigo: string, inicio: string, fim: string) {
  const token = process.env.INMET_TOKEN;
  if (!token) throw new ErroFonte("inmet", "INMET_TOKEN não configurado (dados das estações exigem token)");
  return buscarJson<any[]>("inmet", `https://apitempo.inmet.gov.br/token/estacao/${inicio}/${fim}/${codigo}/${token}`, {
    ttl: TTL.diario,
  });
}
