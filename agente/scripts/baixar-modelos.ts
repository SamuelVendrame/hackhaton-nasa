/**
 * Baixa os modelos Whisper (ONNX) do Hugging Face para agente/modelos/, uma vez.
 * Depois disso tudo roda offline. Uso: bun run scripts/baixar-modelos.ts [base|small]
 */
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

const tamanho = process.argv[2] ?? "base";
const repo = `onnx-community/whisper-${tamanho}`;
const destino = join(import.meta.dir, "..", "modelos", repo);
const arquivos = [
  "config.json",
  "generation_config.json",
  "preprocessor_config.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "onnx/encoder_model_quantized.onnx",
  "onnx/decoder_model_merged_quantized.onnx",
];

for (const a of arquivos) {
  const alvo = join(destino, a);
  const f = Bun.file(alvo);
  if ((await f.exists()) && f.size > 0) {
    console.log("ok  ", a, `${(f.size / 1e6).toFixed(1)} MB`);
    continue;
  }
  const r = await fetch(`https://huggingface.co/${repo}/resolve/main/${a}`, { redirect: "follow" });
  if (!r.ok) throw new Error(`${a}: HTTP ${r.status}`);
  const corpo = new Uint8Array(await r.arrayBuffer());
  await mkdir(dirname(alvo), { recursive: true });
  await Bun.write(alvo, corpo);
  console.log("baixou", a, `${(corpo.length / 1e6).toFixed(1)} MB`);
}
