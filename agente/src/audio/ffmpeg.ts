import ffmpegStatic from "ffmpeg-static";

/** ffmpeg embutido (pacote ffmpeg-static), sem instalação no sistema. */
export const FFMPEG = process.env.FFMPEG_BIN ?? (ffmpegStatic as unknown as string);

async function rodar(args: string[], entrada?: Uint8Array) {
  const p = Bun.spawn([FFMPEG, "-hide_banner", "-loglevel", "error", ...args], {
    stdin: entrada ? "pipe" : "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  if (entrada) {
    p.stdin!.write(entrada);
    p.stdin!.end();
  }
  const [saida, erro, codigo] = await Promise.all([
    new Response(p.stdout).arrayBuffer(),
    new Response(p.stderr).text(),
    p.exited,
  ]);
  if (codigo !== 0) throw new Error(`ffmpeg falhou (${codigo}): ${erro.slice(0, 400)}`);
  return new Uint8Array(saida);
}

/** Qualquer áudio (ogg/opus do WhatsApp, webm do navegador, m4a, mp3, wav) → PCM float32 16 kHz mono para o Whisper. */
export async function paraPcm16k(arquivo: string): Promise<Float32Array> {
  const bytes = await rodar(["-i", arquivo, "-ar", "16000", "-ac", "1", "-f", "f32le", "-"]);
  return new Float32Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 4));
}

/** WAV → OGG/Opus mono (formato de nota de voz do WhatsApp; também toca no navegador). */
export async function paraOggOpus(wav: string, destino: string) {
  await rodar(["-y", "-i", wav, "-ac", "1", "-ar", "48000", "-c:a", "libopus", "-b:a", "32k", "-application", "voip", destino]);
  return destino;
}

/** Duração de um WAV PCM lendo o cabeçalho (sem ffprobe). */
export async function duracaoWav(arquivo: string): Promise<number> {
  const b = new Uint8Array(await Bun.file(arquivo).arrayBuffer());
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let pos = 12;
  let byteRate = 0;
  while (pos + 8 <= b.length) {
    const id = String.fromCharCode(b[pos]!, b[pos + 1]!, b[pos + 2]!, b[pos + 3]!);
    const tam = v.getUint32(pos + 4, true);
    if (id === "fmt ") byteRate = v.getUint32(pos + 16, true);
    if (id === "data" && byteRate) return tam / byteRate;
    pos += 8 + tam + (tam % 2);
  }
  throw new Error(`WAV sem cabeçalho reconhecível: ${arquivo}`);
}
