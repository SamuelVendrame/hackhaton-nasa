import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fromArrayBuffer } from "geotiff";
import { diasEntre, hoje, listarDias } from "../core/calc";
import { DIR_CACHE, ErroFonte } from "../core/http";
import type { Fonte } from "../core/tipos";

/**
 * NASA Earthdata via Harmony (https://harmony.earthdata.nasa.gov), com o token
 * pessoal do Earthdata Login em EARTHDATA_TOKEN (expira em ~60 dias).
 * O Harmony recorta a área e devolve um arquivo pequeno por dia, sem baixar o grânulo global.
 */

export const FONTE_SMAP: Fonte = {
  nome: "NASA SMAP L3 Enhanced (SPL3SMP_E v6) via Harmony",
  url: "https://nsidc.org/data/spl3smp_e",
  resolucao: "9 km",
  tipo: "observacao",
};

export interface EstadoToken {
  ok: boolean;
  usuario?: string;
  expiraEm?: string;
  diasRestantes?: number;
  motivo?: string;
}

/** Lê o token e a validade (campo `exp` do JWT), sem validar a assinatura. */
export function estadoToken(token = process.env.EARTHDATA_TOKEN): EstadoToken {
  if (!token) return { ok: false, motivo: "EARTHDATA_TOKEN não configurado no .env" };
  try {
    const carga = JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString());
    const exp = new Date(carga.exp * 1000);
    const dias = Math.floor((exp.getTime() - Date.now()) / 86_400_000);
    return {
      ok: dias >= 0,
      usuario: carga.uid,
      expiraEm: exp.toISOString().slice(0, 10),
      diasRestantes: dias,
      motivo: dias < 0 ? "token Earthdata expirado: gere outro em urs.earthdata.nasa.gov" : undefined,
    };
  } catch {
    return { ok: false, motivo: "EARTHDATA_TOKEN inválido" };
  }
}

function cabecalho() {
  const t = estadoToken();
  if (!t.ok) throw new ErroFonte("earthdata", t.motivo!);
  return { authorization: `Bearer ${process.env.EARTHDATA_TOKEN}` };
}

interface LinkHarmony {
  href: string;
  title?: string;
}

/** Envia o pedido ao Harmony, espera o job terminar e devolve os links dos arquivos. */
export async function executarHarmony(url: string, limiteMs = 240_000): Promise<LinkHarmony[]> {
  const h = cabecalho();
  const inicio = Date.now();
  const r = await fetch(url, { headers: h, signal: AbortSignal.timeout(60_000) });
  let j: any = await r.json().catch(() => ({}));
  // Período sem passagem do satélite (ex.: só os últimos dias, ainda não processados): não é erro.
  if (r.status === 400 && /no matching granules/i.test(String(j.description ?? ""))) return [];
  if (!r.ok) throw new ErroFonte("harmony", `HTTP ${r.status}: ${j.description ?? ""}`.slice(0, 300), r.status);
  while (j.status === "running" || j.status === "accepted" || j.status === "previewing") {
    if (Date.now() - inicio > limiteMs) throw new ErroFonte("harmony", `job ${j.jobID} não terminou em ${limiteMs / 1000}s`);
    await Bun.sleep(4000);
    j = await (await fetch(`https://harmony.earthdata.nasa.gov/jobs/${j.jobID}`, { headers: h })).json();
  }
  if (j.status !== "successful" && j.status !== "complete_with_errors")
    throw new ErroFonte("harmony", `job ${j.jobID ?? "?"} ${j.status}: ${j.message ?? ""}`.slice(0, 300));
  return (j.links ?? []).filter((l: any) => l.rel === "data");
}

export interface DiaSmap {
  data: string;
  /** Umidade volumétrica do solo (m³/m³) na camada de ~0–5 cm, pixel mais próximo do ponto. */
  umidade: number | null;
  /** Média dos pixels válidos no recorte (~15 km), para quando o ponto vier sem dado. */
  umidadeArea: number | null;
}

/** Lê um GeoTIFF do recorte: valor no pixel do ponto e média dos válidos (-9999 = sem dado). */
export async function lerGeotiffPonto(bytes: ArrayBuffer, lat: number, lon: number) {
  const img = await (await fromArrayBuffer(bytes)).getImage();
  const [x0, y0, x1, y1] = img.getBoundingBox() as [number, number, number, number];
  const w = img.getWidth();
  const hgt = img.getHeight();
  const vals = Array.from((await img.readRasters())[0] as ArrayLike<number>);
  const valido = (v: number) => Number.isFinite(v) && v > -9000 && v >= 0 && v <= 1;
  const col = Math.min(w - 1, Math.max(0, Math.floor(((lon - x0) / (x1 - x0)) * w)));
  const lin = Math.min(hgt - 1, Math.max(0, Math.floor(((y1 - lat) / (y1 - y0)) * hgt)));
  const noPonto = vals[lin * w + col]!;
  const validos = vals.filter(valido);
  return {
    ponto: valido(noPonto) ? noPonto : null,
    area: validos.length ? validos.reduce((a, b) => a + b, 0) / validos.length : null,
  };
}

const dirSmap = () => join(DIR_CACHE, "smap");
const arqDia = (lat: number, lon: number, data: string) =>
  join(dirSmap(), `${lat.toFixed(2)}_${lon.toFixed(2)}_${data}.json`);

/**
 * Umidade do solo SMAP (passagem da manhã) por dia. Dias já baixados ficam em cache
 * permanente (o dado passado não muda); só os que faltam vão ao Harmony, num único job.
 * O SMAP passa a cada 2–3 dias: dias sem passagem voltam com umidade null.
 */
export async function buscarSmap(lat: number, lon: number, inicio: string, fim: string): Promise<DiaSmap[]> {
  await mkdir(dirSmap(), { recursive: true });
  const dias = listarDias(inicio, fim);
  const cache = new Map<string, DiaSmap>();
  for (const d of dias) {
    const f = Bun.file(arqDia(lat, lon, d));
    if (await f.exists()) cache.set(d, await f.json());
  }
  const faltam = dias.filter((d) => !cache.has(d));
  if (faltam.length) {
    const q = new URLSearchParams();
    q.append("subset", `lat(${(lat - 0.07).toFixed(3)}:${(lat + 0.07).toFixed(3)})`);
    q.append("subset", `lon(${(lon - 0.07).toFixed(3)}:${(lon + 0.07).toFixed(3)})`);
    q.append("subset", `time("${faltam[0]}T00:00:00Z":"${faltam.at(-1)}T23:59:59Z")`);
    q.append("format", "image/tiff");
    const variavel = encodeURIComponent("Soil_Moisture_Retrieval_Data_AM/soil_moisture");
    const url = `https://harmony.earthdata.nasa.gov/C2938664763-NSIDC_CPRD/ogc-api-coverages/1.0.0/collections/${variavel}/coverage/rangeset?${q}`;
    const links = await executarHarmony(url);
    const h = cabecalho();
    const obtidos = new Map<string, DiaSmap>();
    await Promise.all(
      links.map(async (l) => {
        const m = /SMAP_L3_SM_P_E_(\d{4})(\d{2})(\d{2})/.exec(l.href);
        if (!m) return;
        const data = `${m[1]}-${m[2]}-${m[3]}`;
        const r = await fetch(l.href, { headers: h, signal: AbortSignal.timeout(60_000) });
        if (!r.ok) return;
        const v = await lerGeotiffPonto(await r.arrayBuffer(), lat, lon);
        obtidos.set(data, { data, umidade: v.ponto, umidadeArea: v.area });
      }),
    );
    // Dias muito recentes podem ainda não ter sido processados: "sem dado" deles não vai para o cache.
    for (const d of faltam) {
      const dia = obtidos.get(d) ?? { data: d, umidade: null, umidadeArea: null };
      cache.set(d, dia);
      const recente = diasEntre(d, hoje()) < 4 && !obtidos.has(d);
      if (!recente) await Bun.write(arqDia(lat, lon, d), JSON.stringify(dia));
    }
  }
  return dias.map((d) => cache.get(d)!);
}


/* ------------------------------- GPM IMERG (chuva) ------------------------------- */

export const FONTE_IMERG: Fonte = {
  nome: "NASA GPM IMERG Late diário (GPM_3IMERGDL v07) via GES DISC OPeNDAP",
  url: "https://disc.gsfc.nasa.gov/datasets/GPM_3IMERGDL_07/summary",
  resolucao: "0,1° (~10 km)",
  tipo: "observacao",
};

export interface DiaImerg {
  data: string;
  /** Chuva do dia em mm (estimativa por satélite calibrada). */
  chuva: number | null;
}

/** Índices da grade IMERG de 0,1°: lon de -179,95 a 179,95 e lat de -89,95 a 89,95. */
export function indiceImerg(lat: number, lon: number) {
  return {
    ilon: Math.min(3599, Math.max(0, Math.round((lon + 179.95) / 0.1))),
    ilat: Math.min(1799, Math.max(0, Math.round((lat + 89.95) / 0.1))),
  };
}

/** Lê a resposta ASCII do OPeNDAP: a última vírgula da linha de `precipitation[...]` traz o valor. */
export function parseImergAscii(texto: string): number | null {
  const linha = texto.split("\n").find((l) => /precipitation\.precipitation\[/.test(l));
  if (!linha) return null;
  const v = Number(linha.split(",").at(-1)!.trim());
  return Number.isFinite(v) && v >= 0 ? v : null;
}

const dirImerg = () => join(DIR_CACHE, "imerg");

/** Chuva diária IMERG no pixel do ponto. Um pedido pequeno por dia, em cache permanente. */
export async function buscarImerg(lat: number, lon: number, inicio: string, fim: string): Promise<DiaImerg[]> {
  await mkdir(dirImerg(), { recursive: true });
  const { ilon, ilat } = indiceImerg(lat, lon);
  const arq = (d: string) => join(dirImerg(), `${ilat}_${ilon}_${d}.json`);
  const dias = listarDias(inicio, fim);
  const out = new Map<string, DiaImerg>();
  for (const d of dias) {
    const f = Bun.file(arq(d));
    if (await f.exists()) out.set(d, await f.json());
  }
  const faltam = dias.filter((d) => !out.has(d));
  if (faltam.length) {
    // Nomes exatos dos grânulos pelo CMR (a versão do arquivo muda: V07B, V07C...).
    const cmr = await fetch(
      `https://cmr.earthdata.nasa.gov/search/granules.json?short_name=GPM_3IMERGDL&version=07` +
        `&temporal=${faltam[0]}T00:00:00Z,${faltam.at(-1)}T23:59:59Z&page_size=400`,
      { signal: AbortSignal.timeout(60_000) },
    ).then((r) => r.json() as Promise<any>);
    const granulos = new Map<string, string>();
    for (const e of cmr?.feed?.entry ?? []) granulos.set(String(e.time_start).slice(0, 10), e.producer_granule_id);
    const h = cabecalho();
    const fila = faltam.filter((d) => granulos.has(d));
    const trabalhador = async () => {
      for (let d = fila.shift(); d; d = fila.shift()) {
        const g = granulos.get(d)!;
        const url =
          `https://gpm1.gesdisc.eosdis.nasa.gov/opendap/GPM_L3/GPM_3IMERGDL.07/${d.slice(0, 4)}/${d.slice(5, 7)}/${g}` +
          `.ascii?precipitation[0][${ilon}][${ilat}]`;
        try {
          const r = await fetch(url, { headers: h, signal: AbortSignal.timeout(60_000) });
          if (r.status === 401) throw new ErroFonte("imerg", "token recusado pelo GES DISC (autorize o app 'NASA GESDISC DATA ARCHIVE' no Earthdata)", 401);
          if (!r.ok) continue;
          const dia = { data: d, chuva: parseImergAscii(await r.text()) };
          out.set(d, dia);
          if (dia.chuva != null) await Bun.write(arq(d), JSON.stringify(dia));
        } catch (e) {
          if (e instanceof ErroFonte) throw e;
        }
      }
    };
    await Promise.all(Array.from({ length: 6 }, trabalhador));
  }
  return dias.map((d) => out.get(d) ?? { data: d, chuva: null });
}
