import { join } from "node:path";
import { CONFIG } from "../config";
import type { AudioGerado } from "../contratos";
import { duracaoWav, paraOggOpus } from "./ffmpeg";

/**
 * Texto → fala, local. Motor padrão: SAPI do Windows com a voz "Microsoft Maria" (pt-BR),
 * que já vem instalada. Motor preferido: Piper (neural, mais natural), quando instalado.
 * Outros motores (Kokoro etc.) entram implementando `MotorVoz`.
 */
export interface MotorVoz {
  nome: string;
  sintetizar(texto: string, destinoWav: string): Promise<void>;
}

/** Rede de segurança antes do sintetizador: troca símbolos e siglas pelo que se fala. */
export function prepararParaFala(texto: string): string {
  return texto
    .replace(/R\$\s?(\d[\d.,]*)/g, "$1 reais")
    .replace(/(\d)\s?%/g, "$1 por cento")
    .replace(/(\d)\s?°\s?C\b/g, "$1 graus")
    .replace(/(\d)\s?°/g, "$1 graus")
    .replace(/(\d)\s?mm\b/g, "$1 milímetros")
    .replace(/(\d)\s?km\/h\b/g, "$1 quilômetros por hora")
    .replace(/(\d)\s?ha\b/g, "$1 hectares")
    .replace(/(\d)\s?sc\b/g, "$1 sacas")
    .replace(/\bZARC\b/g, "zoneamento")
    .replace(/[*#_`>|•]/g, " ")
    .replace(/[()[\]]/g, ", ")
    .replace(/\s*\/\s*/g, " por ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,;.!?])/g, "$1")
    .replace(/,\s*([,;.!?])/g, "$1")
    .trim();
}

export const motorSapi: MotorVoz = {
  nome: `sapi:${CONFIG.vozSapi}`,
  async sintetizar(texto, destinoWav) {
    // Texto via arquivo para não ter problema de aspas/acentos na linha de comando.
    const arqTexto = destinoWav.replace(/\.wav$/i, ".txt");
    await Bun.write(arqTexto, texto);
    const script = [
      "Add-Type -AssemblyName System.Speech",
      "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer",
      `try { $s.SelectVoice('${CONFIG.vozSapi.replace(/'/g, "''")}') } catch { }`,
      `$s.Rate = ${Math.max(-10, Math.min(10, CONFIG.velocidadeVoz))}`,
      `$s.SetOutputToWaveFile('${destinoWav.replace(/'/g, "''")}')`,
      `$t = [System.IO.File]::ReadAllText('${arqTexto.replace(/'/g, "''")}', [System.Text.Encoding]::UTF8)`,
      "$s.Speak($t)",
      "$s.Dispose()",
    ].join("; ");
    const p = Bun.spawn(["powershell", "-NoProfile", "-NonInteractive", "-Command", script], { stdout: "pipe", stderr: "pipe" });
    const [erro, codigo] = await Promise.all([new Response(p.stderr).text(), p.exited]);
    if (codigo !== 0) throw new Error(`SAPI falhou: ${erro.slice(0, 300)}`);
  },
};

/**
 * Piper (rhasspy/piper, voz neural VITS pt-BR, roda em CPU, offline). Muito mais natural que a SAPI.
 * O binário de 2023 não aceita as chaves de ditongo (ex.: "aɪ") dos arquivos de voz novos;
 * scripts/baixar-voz.ts remove essas chaves, que o fonemizador dele nunca gera.
 */
export const motorPiper: MotorVoz = {
  nome: `piper:${CONFIG.vozPiper}`,
  async sintetizar(texto, destinoWav) {
    const exe = join(CONFIG.dirPiper, "piper", process.platform === "win32" ? "piper.exe" : "piper");
    const modelo = join(CONFIG.dirPiper, `${CONFIG.vozPiper}.onnx`);
    const p = Bun.spawn([exe, "-q", "-m", modelo, "-f", destinoWav, "--length_scale", String(CONFIG.ritmoPiper), "--sentence_silence", "0.25"], {
      stdin: "pipe", stdout: "pipe", stderr: "pipe",
    });
    // Uma frase por linha: o Piper sintetiza linha a linha, com pausa entre frases.
    p.stdin!.write(texto.split(/(?<=[.!?])\s+/).join("\n") + "\n");
    p.stdin!.end();
    const [erro, codigo] = await Promise.all([new Response(p.stderr).text(), p.exited]);
    if (codigo !== 0 || !(await Bun.file(destinoWav).exists())) throw new Error(`Piper falhou: ${erro.slice(0, 300)}`);
  },
};

export function motorVoz(): MotorVoz {
  if (CONFIG.motorVoz === "sapi") return motorSapi;
  if (CONFIG.motorVoz === "piper") return motorPiper;
  throw new Error(`motor de voz desconhecido: ${CONFIG.motorVoz}`);
}

export async function sintetizar(texto: string, destinoWav: string, motor = motorVoz()): Promise<AudioGerado> {
  await motor.sintetizar(prepararParaFala(texto), destinoWav);
  const ogg = await paraOggOpus(destinoWav, destinoWav.replace(/\.wav$/i, ".ogg")).catch(() => undefined);
  return { arquivoWav: destinoWav, arquivoOgg: ogg, duracaoS: await duracaoWav(destinoWav), motor: motor.nome };
}
