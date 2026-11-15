import * as XLSX from "xlsx";
import { buscarBytes, TTL } from "../core/http";
import type { Fonte } from "../core/tipos";

/**
 * SEAB/DERAL (Paraná) — preços recebidos pelos produtores — sem chave.
 * Página: https://www.agricultura.pr.gov.br/deral/precos
 * - prp.xls: semanal, por núcleo regional (20 núcleos na planilha + média do estado e semana anterior).
 * - pmrp.xls: mensal (13 meses) e médias anuais dos últimos 5 anos, média do estado.
 * Arquivos XLS (Excel 97), sobrescritos a cada publicação: guardar histórico é responsabilidade nossa.
 */
export const FONTE_DERAL: Fonte = {
  nome: "SEAB/DERAL — Preços recebidos pelos produtores (PR)",
  url: "https://www.agricultura.pr.gov.br/deral/precos",
  tipo: "estatistica_oficial",
};

const BASE = "https://www.agricultura.pr.gov.br/system/files/publico/Precos";

export interface PrecoSemanal {
  grupo: string;
  produto: string;
  unidade: string;
  porRegional: Record<string, number>;
  mediaEstado: number | null;
  semanaAnterior: number | null;
  variacaoPct: number | null;
}

export interface PrecoMensal {
  grupo: string;
  produto: string;
  unidade: string;
  /** "OUT/26" → valor, do mais recente para o mais antigo. */
  meses: { mes: string; valor: number | null }[];
  anos: { ano: string; valor: number | null }[];
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

function linhas(bytes: Uint8Array) {
  const wb = XLSX.read(bytes);
  return XLSX.utils.sheet_to_json<any[]>(wb.Sheets[wb.SheetNames[0]!]!, { header: 1, raw: true });
}

export function parseSemanal(bytes: Uint8Array) {
  const rows = linhas(bytes);
  const titulo = rows[0] ?? [];
  const semana = String(titulo.find((c: any) => /SEMANA:/i.test(String(c))) ?? "");
  const periodo = String(titulo.find((c: any) => /PER[IÍ]ODO:/i.test(String(c))) ?? "");
  const cab = rows[1] as string[];
  const iMedia = cab.indexOf("MÉDIA");
  const iMsa = cab.indexOf("MSA");
  const iPct = cab.indexOf("%MSA");
  const regionais = cab.slice(3, iMedia);
  let grupo = "";
  const precos: PrecoSemanal[] = [];
  for (const r of rows.slice(2)) {
    if (r[0] && !r[1]) {
      grupo = String(r[0]).trim();
      continue;
    }
    if (!r[1]) continue;
    const porRegional: Record<string, number> = {};
    regionais.forEach((reg, i) => {
      const v = num(r[3 + i]);
      if (v != null) porRegional[reg] = v;
    });
    precos.push({
      grupo,
      produto: String(r[1]).trim(),
      unidade: String(r[2] ?? "").trim(),
      porRegional,
      mediaEstado: num(r[iMedia]),
      semanaAnterior: num(r[iMsa]),
      variacaoPct: num(r[iPct]),
    });
  }
  return { semana: semana.replace(/SEMANA:\s*/i, ""), periodo: periodo.replace(/PER[IÍ]ODO:\s*/i, ""), regionais, precos };
}

export function parseMensal(bytes: Uint8Array) {
  const rows = linhas(bytes);
  const cab = rows[1] as (string | null)[];
  const colMeses = cab.map((c, i) => [c, i] as const).filter(([c]) => c && /^[A-Z]{3}\/\d{2}$/.test(c));
  const colAnos = cab.map((c, i) => [c, i] as const).filter(([c]) => c && /^Ano\/\d{2}$/.test(c));
  let grupo = "";
  const precos: PrecoMensal[] = [];
  for (const r of rows.slice(2)) {
    if (r[0] && !r[1]) {
      grupo = String(r[0]).trim();
      continue;
    }
    if (!r[1]) continue;
    precos.push({
      grupo,
      produto: String(r[1]).trim(),
      unidade: String(r[2] ?? "").trim(),
      meses: colMeses.map(([c, i]) => ({ mes: c!, valor: num(r[i]) })),
      anos: colAnos.map(([c, i]) => ({ ano: c!, valor: num(r[i]) })),
    });
  }
  return { titulo: String(rows[0]?.[0] ?? "").replace(/\s+/g, " ").trim(), precos };
}

export async function buscarPrecosSemanais() {
  return parseSemanal(await buscarBytes("deral", `${BASE}/prp.xls`, { ttl: TTL.diario }));
}

export async function buscarPrecosMensais() {
  return parseMensal(await buscarBytes("deral", `${BASE}/pmrp.xls`, { ttl: TTL.diario }));
}

/**
 * Núcleo regional da SEAB mais adequado para um município. Mapeamento parcial e a validar:
 * o DERAL não publica um núcleo para Cianorte nesta planilha; usamos Umuarama e Maringá (vizinhos).
 */
export const REGIONAL_POR_MUNICIPIO: Record<string, string[]> = {
  "4105508": ["Umuarama", "Maringá"], // Cianorte
  "4115200": ["Maringá"],
  "4128104": ["Umuarama"],
  "4118402": ["Paranavaí"],
  "4104303": ["Campo Mourão"],
};
