import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

/**
 * Camada HTTP única: timeout, novas tentativas e cache em disco.
 * O cache é o que permite agrupar ferramentas da mesma fonte: várias
 * ferramentas pedem a mesma URL e só a primeira vai à rede.
 */
export const DIR_CACHE = process.env.FIELD_CACHE_DIR ?? join(import.meta.dir, "..", "..", ".cache");

export interface OpcoesHttp {
  /** Tempo de vida do cache em segundos. 0 desliga o cache. */
  ttl?: number;
  timeoutMs?: number;
  tentativas?: number;
  headers?: Record<string, string>;
}

export class ErroFonte extends Error {
  constructor(
    public fonte: string,
    message: string,
    public status?: number,
  ) {
    super(`[${fonte}] ${message}`);
  }
}

const UMA_HORA = 3600;

function chave(url: string) {
  return createHash("sha1").update(url).digest("hex");
}

async function lerCache(url: string, ttl: number): Promise<Uint8Array | null> {
  if (ttl <= 0) return null;
  const f = Bun.file(join(DIR_CACHE, "http", chave(url)));
  if (!(await f.exists())) return null;
  if ((Date.now() - f.lastModified) / 1000 > ttl) return null;
  return new Uint8Array(await f.arrayBuffer());
}

async function gravarCache(url: string, corpo: Uint8Array) {
  await mkdir(join(DIR_CACHE, "http"), { recursive: true });
  await Bun.write(join(DIR_CACHE, "http", chave(url)), corpo);
}

export async function buscarBytes(fonte: string, url: string, op: OpcoesHttp = {}): Promise<Uint8Array> {
  const ttl = op.ttl ?? UMA_HORA;
  const cache = await lerCache(url, ttl);
  if (cache) return cache;

  const tentativas = op.tentativas ?? 3;
  let ultimoErro: unknown;
  for (let i = 0; i < tentativas; i++) {
    try {
      const r = await fetch(url, {
        headers: { "user-agent": "field-shift-tools/0.1", ...op.headers },
        signal: AbortSignal.timeout(op.timeoutMs ?? 60_000),
      });
      if (r.status === 429 || r.status >= 500) throw new ErroFonte(fonte, `HTTP ${r.status}`, r.status);
      if (!r.ok) throw new ErroFonte(fonte, `HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`, r.status);
      const corpo = new Uint8Array(await r.arrayBuffer());
      if (ttl > 0) await gravarCache(url, corpo);
      return corpo;
    } catch (e) {
      ultimoErro = e;
      // Erro 4xx (exceto 429) não melhora com nova tentativa.
      if (e instanceof ErroFonte && e.status && e.status < 500 && e.status !== 429) break;
      if (i < tentativas - 1) await Bun.sleep(1000 * 2 ** i);
    }
  }
  if (ultimoErro instanceof ErroFonte) throw ultimoErro;
  throw new ErroFonte(fonte, `falha de rede: ${(ultimoErro as Error)?.message ?? ultimoErro}`);
}

export async function buscarTexto(fonte: string, url: string, op?: OpcoesHttp) {
  return new TextDecoder().decode(await buscarBytes(fonte, url, op));
}

export async function buscarJson<T = any>(fonte: string, url: string, op?: OpcoesHttp): Promise<T> {
  const t = await buscarTexto(fonte, url, op);
  try {
    return JSON.parse(t) as T;
  } catch {
    throw new ErroFonte(fonte, `resposta não é JSON: ${t.slice(0, 200)}`);
  }
}

export const TTL = {
  previsao: 3 * UMA_HORA,
  diario: 12 * UMA_HORA,
  semanal: 3 * 24 * UMA_HORA,
  estatico: 30 * 24 * UMA_HORA,
};
