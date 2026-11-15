import { env, pipeline } from "@huggingface/transformers";
import { CONFIG } from "../config";
import type { Transcricao } from "../contratos";
import { paraPcm16k } from "./ffmpeg";

/**
 * Whisper local (ONNX via transformers.js), sem internet depois que o modelo foi baixado
 * (scripts/baixar-modelos.ts). O modelo fica carregado na memória entre áudios.
 */
env.localModelPath = CONFIG.dirModelos + "/";
env.allowRemoteModels = false;

type Asr = (audio: Float32Array, op: Record<string, unknown>) => Promise<{ text: string } | { text: string }[]>;
const carregados = new Map<string, Promise<Asr>>();

function carregar(modelo: string): Promise<Asr> {
  if (!carregados.has(modelo)) {
    carregados.set(
      modelo,
      pipeline("automatic-speech-recognition", modelo, {
        dtype: { encoder_model: "q8", decoder_model_merged: "q8" } as any,
      }) as unknown as Promise<Asr>,
    );
  }
  return carregados.get(modelo)!;
}

export async function transcreverPcm(pcm: Float32Array, modelo = CONFIG.modeloWhisper): Promise<Transcricao> {
  const t0 = Date.now();
  const asr = await carregar(modelo);
  const r = await asr(pcm, { language: "portuguese", task: "transcribe", chunk_length_s: 30, stride_length_s: 5 });
  const texto = (Array.isArray(r) ? r.map((x) => x.text).join(" ") : r.text).replace(/\s+/g, " ").trim();
  return { texto, duracaoAudioS: pcm.length / 16000, modelo, tempoProcessamentoMs: Date.now() - t0 };
}

export async function transcreverArquivo(arquivo: string, modelo?: string): Promise<Transcricao> {
  return transcreverPcm(await paraPcm16k(arquivo), modelo);
}
