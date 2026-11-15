#!/usr/bin/env bun
/**
 * Uso:
 *   bun run cli                         → lista as ferramentas
 *   bun run cli <ferramenta> --cep 87209000 --cultura soja --historico batata,milho
 *   bun run cli <ferramenta> --json '{"cep":"87209000","cultura":"soja"}'
 * Saída: JSON no stdout (pronto para outro programa ou fluxo de IA consumir).
 */
import { z } from "zod";
import { executar, FERRAMENTAS, acharFerramenta } from "./ferramentas";

const [nome, ...resto] = process.argv.slice(2);

if (!nome || nome === "--help" || nome === "listar") {
  console.log("Ferramentas disponíveis:\n");
  const LOCAL = new Set(["cep", "lat", "lon", "ibge", "municipio", "uf"]);
  for (const f of FERRAMENTAS) {
    console.log(`  ${f.nome.padEnd(22)} [${f.grupo}] ${f.descricao}`);
    const params = Object.entries(f.entrada).filter(([k]) => !LOCAL.has(k));
    const temLocal = Object.keys(f.entrada).some((k) => LOCAL.has(k));
    const desc = params.map(([k, z]) => `${k}${z.isOptional() ? "?" : ""}${z.description ? ` (${z.description})` : ""}`);
    if (temLocal || desc.length) console.log(`  ${"".padEnd(22)}   parâmetros: ${[temLocal ? "local (cep | lat+lon | ibge | municipio+uf)" : "", ...desc].filter(Boolean).join("; ")}`);
  }
  console.log("\nExemplo: bun run cli clima_janela --cep 87209000 --inicio 2026-12-01 --fim 2027-03-31");
  process.exit(0);
}

const f = acharFerramenta(nome);
if (!f) {
  console.error(`Ferramenta desconhecida: ${nome}`);
  process.exit(1);
}

function converter(chave: string, valor: string) {
  let tipo: z.ZodTypeAny | undefined = f!.entrada[chave];
  // Desembrulha só optional/default/nullable (ZodArray também tem unwrap(), que devolveria o item).
  while (tipo instanceof z.ZodOptional || tipo instanceof z.ZodDefault || tipo instanceof z.ZodNullable) tipo = (tipo as any).unwrap();
  if (tipo instanceof z.ZodNumber) return Number(valor);
  if (tipo instanceof z.ZodArray) return valor.split(",").map((s) => s.trim()).filter(Boolean);
  if (valor.startsWith("{") || valor.startsWith("[")) return JSON.parse(valor);
  return valor;
}

let args: Record<string, unknown> = {};
for (let i = 0; i < resto.length; i++) {
  const k = resto[i]!;
  if (!k.startsWith("--")) continue;
  const chave = k.slice(2);
  const valor = resto[i + 1] ?? "";
  i++;
  if (chave === "json") args = { ...args, ...JSON.parse(valor) };
  else args[chave] = converter(chave, valor);
}

try {
  const r = await executar(nome, args);
  console.log(JSON.stringify(r, null, 2));
} catch (e) {
  console.error(JSON.stringify({ erro: (e as Error).message }, null, 2));
  process.exit(1);
}
