/**
 * Instala o Piper (voz neural local) em modelos/piper:
 *   bun run scripts/baixar-voz.ts [faber|cadu|jeff]
 * Fontes: github.com/rhasspy/piper (binário Windows 2023.11.14-2) e huggingface.co/rhasspy/piper-voices.
 * Usa curl com retomada (-C -), porque o Hugging Face às vezes corta downloads longos.
 */
import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { CONFIG } from "../src/config";

const voz = process.argv[2] ?? "faber";
const dir = CONFIG.dirPiper;
await mkdir(dir, { recursive: true });

async function curl(url: string, destino: string) {
  for (let i = 1; i <= 5; i++) {
    const p = Bun.spawn(["curl", "-sSfL", "-C", "-", "--retry", "3", "-o", destino, url], { stdout: "inherit", stderr: "inherit" });
    if ((await p.exited) === 0) return;
    console.log(`  tentativa ${i} falhou, retomando...`);
  }
  throw new Error(`não consegui baixar ${url}`);
}

async function tamanhoRemoto(url: string) {
  const r = await fetch(url, { method: "HEAD", redirect: "follow" });
  return Number(r.headers.get("content-length") ?? 0);
}

if (!existsSync(join(dir, "piper", "piper.exe"))) {
  const zip = join(dir, "piper_windows_amd64.zip");
  console.log("baixando o Piper (22 MB)...");
  await curl("https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip", zip);
  const p = Bun.spawn(["tar", "-xf", zip, "-C", dir], { stdout: "inherit", stderr: "inherit" });
  if ((await p.exited) !== 0) throw new Error("falha ao extrair o Piper");
  await rm(zip);
}

const nome = `pt_BR-${voz}-medium`;
const base = `https://huggingface.co/rhasspy/piper-voices/resolve/main/pt/pt_BR/${voz}/medium/${nome}`;
const onnx = join(dir, `${nome}.onnx`);
const esperado = await tamanhoRemoto(`${base}.onnx`);
if (!existsSync(onnx) || Bun.file(onnx).size !== esperado) {
  console.log(`baixando a voz ${nome} (${Math.round(esperado / 1e6)} MB)...`);
  await curl(`${base}.onnx`, onnx);
  if (Bun.file(onnx).size !== esperado) throw new Error(`voz incompleta: ${Bun.file(onnx).size} de ${esperado} bytes`);
}

// Config da voz, sem as chaves de ditongo que o binário de 2023 rejeita ("aɪ" is not a single codepoint).
const cfg = (await (await fetch(`${base}.onnx.json`)).json()) as { phoneme_id_map: Record<string, number[]> };
for (const k of Object.keys(cfg.phoneme_id_map)) if ([...k].length > 1) delete cfg.phoneme_id_map[k];
await Bun.write(`${onnx}.json`, JSON.stringify(cfg));
console.log(`pronto: ${onnx}\nuse VOZ_PIPER=${nome} (padrão: pt_BR-faber-medium)`);
