import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Carrega tools/.env mesmo quando o processo começa em outra pasta (ex.: o servidor MCP
 * iniciado pelo Claude Code ou importado pelo agente). Variáveis já definidas têm prioridade.
 */
const arq = join(import.meta.dir, "..", "..", ".env");
if (existsSync(arq)) {
  for (const linha of readFileSync(arq, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(linha);
    if (m && m[2] && !process.env[m[1]!]) process.env[m[1]!] = m[2].replace(/^["']|["']$/g, "");
  }
}
