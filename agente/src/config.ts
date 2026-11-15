import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

/** Configuração única, por variáveis de ambiente (.env do Bun) com padrões que funcionam localmente. */
const RAIZ = resolve(import.meta.dir, "..");
const env = process.env;

function caminhoClaude() {
  if (env.CLAUDE_BIN) return env.CLAUDE_BIN;
  const local = join(env.USERPROFILE ?? env.HOME ?? "", ".local", "bin", process.platform === "win32" ? "claude.exe" : "claude");
  return existsSync(local) ? local : "claude";
}

function modeloWhisperPadrao() {
  const small = join(RAIZ, "modelos", "onnx-community", "whisper-small", "onnx", "decoder_model_merged_quantized.onnx");
  return existsSync(small) ? "onnx-community/whisper-small" : "onnx-community/whisper-base";
}

export const CONFIG = {
  raiz: RAIZ,
  dirTools: resolve(RAIZ, "..", "tools"),
  dirCaixaEntrada: env.CAIXA_ENTRADA ?? join(RAIZ, "caixa", "entrada"),
  dirCaixaSaida: env.CAIXA_SAIDA ?? join(RAIZ, "caixa", "saida"),
  dirTrabalhos: env.DIR_TRABALHOS ?? join(RAIZ, "trabalhos"),
  dirClientes: env.DIR_CLIENTES ?? join(RAIZ, "dados", "clientes"),
  dirModelos: join(RAIZ, "modelos"),
  dirPrompts: join(RAIZ, "prompts"),
  porta: Number(env.PORTA ?? 3333),

  /** Whisper: base (77 MB, rápido) ou small (240 MB, erra menos em português). */
  modeloWhisper: env.WHISPER_MODELO ?? modeloWhisperPadrao(),

  /** Voz: "piper" (neural, offline, mais natural) se instalado; senão "sapi" (Windows, voz Maria). */
  motorVoz: env.VOZ_MOTOR ?? (existsSync(join(RAIZ, "modelos", "piper", "piper", "piper.exe")) ? "piper" : "sapi"),
  dirPiper: join(RAIZ, "modelos", "piper"),
  vozPiper: env.VOZ_PIPER ?? "pt_BR-faber-medium",
  /** Piper: >1 fala mais devagar. */
  ritmoPiper: Number(env.VOZ_PIPER_RITMO ?? 1.0),
  vozSapi: env.VOZ_SAPI ?? "Microsoft Maria Desktop",
  /** -10 a 10. A voz Maria já é pausada; 0 equilibra clareza e duração. */
  velocidadeVoz: Number(env.VOZ_VELOCIDADE ?? 0),

  /** Motor dos agentes: "claude" (Claude Code headless) ou "arquivo" (handoff por arquivos, para testes/humano). */
  motorAgente: (env.AGENTE_MOTOR ?? "claude") as "claude" | "arquivo",
  claudeBin: caminhoClaude(),
  modeloAnalista: env.MODELO_ANALISTA ?? "sonnet",
  modeloComunicador: env.MODELO_COMUNICADOR ?? "haiku",
  /** Esforço de raciocínio (low | medium | high). O analista decide; o comunicador só reescreve. */
  esforcoAnalista: env.ESFORCO_ANALISTA ?? "medium",
  esforcoComunicador: env.ESFORCO_COMUNICADOR ?? "low",
  raciocinioComunicador: env.RACIOCINIO_COMUNICADOR === "1",
  /** Tempo máximo de espera por um agente (ms). */
  timeoutAgenteMs: Number(env.AGENTE_TIMEOUT_MS ?? 15 * 60_000),

  /** Verificação: abaixo disso o áudio é considerado pouco inteligível. */
  similaridadeMinima: Number(env.SIMILARIDADE_MINIMA ?? 0.8),
  tentativasComunicador: Number(env.TENTATIVAS_COMUNICADOR ?? 2),
};
