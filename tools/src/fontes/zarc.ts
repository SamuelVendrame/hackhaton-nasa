import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { buscarJson, DIR_CACHE, ErroFonte, TTL } from "../core/http";
import type { Fonte } from "../core/tipos";

/**
 * ZARC — Zoneamento Agrícola de Risco Climático (MAPA), Tábua de Risco — sem chave, CC-BY.
 * Catálogo: https://dados.agricultura.gov.br/dataset/tabua-de-risco-zoneamento-agricola-de-risco-climatico
 * Um CSV por safra (~250 MB, separador ";"), uma linha por cultura × município × solo × ciclo × manejo,
 * com o risco de perda indicado para cada decêndio de plantio (dec1..dec36):
 *   0 = plantio não indicado · 20, 30, 40 = risco de perda de até 20%, 30% ou 40%.
 * Códigos (dicionário de dados 2026):
 *   Cod_Solo: 1 Arenoso, 2 Textura média, 3 Argiloso, 11..16 = AD1..AD6 (classes de água disponível, AD1 = menor)
 *   Cod_Ciclo: 13 Perene, 19 Semiperene, 20..26 = Grupo I..VI (ciclo/precocidade da cultivar)
 *   Cod_Outros_Manejos: 1 Sequeiro, 2 Irrigado, 3 Irrigado com controle de geada
 */
export const FONTE_ZARC: Fonte = {
  nome: "ZARC — Tábua de Risco (MAPA)",
  url: "https://dados.agricultura.gov.br/dataset/tabua-de-risco-zoneamento-agricola-de-risco-climatico",
  tipo: "norma_oficial",
};

const PACOTE = "6d3d141c-885e-41a4-ab7f-dc8ff323b96f";

export const SOLOS: Record<string, string> = {
  "1": "Arenoso",
  "2": "Textura média",
  "3": "Argiloso",
  "11": "AD1",
  "12": "AD2",
  "13": "AD3",
  "14": "AD4",
  "15": "AD5",
  "16": "AD6",
};
export const CICLOS: Record<string, string> = {
  "13": "Perene",
  "19": "Semiperene",
  "20": "Grupo I",
  "21": "Grupo II",
  "22": "Grupo III",
  "24": "Grupo IV",
  "25": "Grupo V",
  "26": "Grupo VI",
};

export interface LinhaZarc {
  cultura: string;
  safra: string;
  solo: string;
  ciclo: string;
  manejo: string;
  clima: string;
  /** Nível de manejo NM1..NM4 (soja/milho: tecnologia e produtividade esperada), vazio se não se aplica. */
  nivelManejo: string;
  portaria: string;
  /** risco[0] = decêndio 1 (1–10/jan). 0 = não indicado. */
  risco: number[];
}

/** Interpreta uma linha do CSV (já separada por ";"), dado o índice das colunas. */
export function parseLinhaZarc(campos: string[], idx: Record<string, number>): LinhaZarc {
  const col = (n: string) => campos[idx[n]!] ?? "";
  const risco: number[] = [];
  for (let i = 1; i <= 36; i++) risco.push(Number(col(`dec${i}`)) || 0);
  return {
    cultura: col("Nome_cultura"),
    safra: `${col("SafraIni")}/${col("SafraFin")}`,
    solo: SOLOS[col("Cod_Solo")] ?? col("Cod_Solo"),
    ciclo: CICLOS[col("Cod_Ciclo")] ?? col("Cod_Ciclo"),
    manejo: col("Nome_Outros_Manejos"),
    clima: col("Nome_Clima"),
    nivelManejo: col("Cod_NM") ? `NM${col("Cod_NM")}` : "",
    portaria: col("Portaria"),
    risco,
  };
}

/** Lista os CSVs disponíveis no catálogo (safras e o de perenes/olerícolas). */
export async function listarRecursosZarc() {
  const r = await buscarJson("zarc", `https://dados.agricultura.gov.br/api/3/action/package_show?id=${PACOTE}`, {
    ttl: TTL.semanal,
  });
  return (r.result.resources as any[])
    .filter((x) => String(x.format).toUpperCase() === "CSV")
    .map((x) => ({ nome: x.name as string, url: x.url as string, modificado: x.last_modified as string }));
}

/** Safra agrícola vigente para uma data (jul–jun): 2026-11 → "2026/2027". */
export function safraDaData(dataIso: string) {
  const ano = Number(dataIso.slice(0, 4));
  const mes = Number(dataIso.slice(5, 7));
  return mes >= 7 ? `${ano}/${ano + 1}` : `${ano - 1}/${ano}`;
}

async function baixarCsv(url: string, destino: string) {
  const f = Bun.file(destino);
  if ((await f.exists()) && (Date.now() - f.lastModified) / 1000 < TTL.semanal) return;
  await mkdir(join(destino, ".."), { recursive: true });
  const r = await fetch(url, { signal: AbortSignal.timeout(15 * 60_000) });
  if (!r.ok) throw new ErroFonte("zarc", `download falhou: HTTP ${r.status}`, r.status);
  await Bun.write(destino + ".tmp", r);
  await Bun.write(destino, Bun.file(destino + ".tmp"));
  await Bun.file(destino + ".tmp").delete();
}

/** Lê o CSV em streaming e devolve só as linhas do município (geocódigo IBGE). */
async function filtrarMunicipio(caminho: string, ibge: string): Promise<LinhaZarc[]> {
  const leitor = Bun.file(caminho).stream().pipeThrough(new TextDecoderStream("utf-8")).getReader();
  let resto = "";
  let idx: Record<string, number> | null = null;
  const out: LinhaZarc[] = [];
  const marcador = `;${ibge};`;
  for (;;) {
    const { done, value } = await leitor.read();
    const bloco = resto + (value ?? "");
    const linhas = bloco.split(/\r?\n/);
    resto = done ? "" : linhas.pop()!;
    for (const linha of linhas) {
      if (!idx) {
        const cab = linha.replace(/^﻿/, "").split(";");
        idx = Object.fromEntries(cab.map((c, i) => [c.trim(), i]));
        continue;
      }
      if (!linha.includes(marcador)) continue;
      const campos = linha.split(";");
      if (campos[idx.geocodigo!] === ibge) out.push(parseLinhaZarc(campos, idx));
    }
    if (done) break;
  }
  return out;
}

/**
 * Linhas do ZARC de um município para uma safra. A primeira chamada baixa o CSV
 * da safra (~250 MB, alguns minutos); depois o recorte do município fica em cache.
 */
export async function buscarZarcMunicipio(ibge: string, safra: string): Promise<LinhaZarc[]> {
  const nomeSafra = safra.replace("/", "_");
  const recorte = join(DIR_CACHE, "zarc", `${nomeSafra}_${ibge}.json`);
  const fr = Bun.file(recorte);
  if ((await fr.exists()) && (Date.now() - fr.lastModified) / 1000 < TTL.semanal) return fr.json();

  const recursos = await listarRecursosZarc();
  const alvo = recursos.find((r) => r.nome.includes(`Safra ${safra}`));
  const perenes = recursos.find((r) => /perene/i.test(r.nome));
  if (!alvo) throw new ErroFonte("zarc", `safra ${safra} não publicada; disponíveis: ${recursos.map((r) => r.nome).join(", ")}`);

  const linhas: LinhaZarc[] = [];
  for (const rec of [alvo, perenes].filter(Boolean) as typeof recursos) {
    const csv = join(DIR_CACHE, "zarc", rec.url.split("/").pop()!);
    await baixarCsv(rec.url, csv);
    linhas.push(...(await filtrarMunicipio(csv, ibge)));
  }
  await mkdir(join(DIR_CACHE, "zarc"), { recursive: true });
  await Bun.write(recorte, JSON.stringify(linhas));
  return linhas;
}
