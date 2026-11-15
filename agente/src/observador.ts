import { watch } from "node:fs";
import { mkdir, readdir, rename } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { CONFIG } from "./config";
import { criarTrabalho, lerEstado, processar, type OpcoesPipeline, type Trabalho } from "./pipeline";

/**
 * Observa a caixa de entrada e processa cada áudio novo, um por vez (Whisper e voz
 * disputam a mesma CPU; fila serial é mais rápida do que paralelo nesta máquina).
 *
 * Nome do arquivo: `{clienteId}__{qualquer-coisa}.{ogg|webm|m4a|mp3|wav}`.
 * Opcional: `{mesmo-nome}.json` ao lado com { "clienteId": "...", "canal": "whatsapp" }.
 * Depois de entrar na fila, o arquivo vai para caixa/entrada/processados/.
 */

const EXTENSOES = new Set([".ogg", ".oga", ".opus", ".webm", ".m4a", ".mp3", ".wav", ".mp4", ".aac"]);

export function clienteDoArquivo(nome: string) {
  const m = /^([a-zA-Z0-9-]+)__/.exec(basename(nome));
  return m ? m[1]! : "desconhecido";
}

type Tarefa = Trabalho | (() => Promise<Trabalho>);

export class Observador {
  private fila: Tarefa[] = [];
  private vistos = new Set<string>();
  private rodando = false;
  ouvintes: ((id: string, situacao: string) => void)[] = [];

  constructor(private op: OpcoesPipeline = {}) {}

  get tamanhoFila() {
    return this.fila.length;
  }

  /** Coloca um trabalho já criado (ex.: pelo servidor HTTP) na fila. */
  enfileirar(t: Trabalho) {
    this.fila.push(t);
    void this.drenar();
  }

  private async arquivoNovo(arq: string) {
    const nome = basename(arq);
    if (this.vistos.has(nome) || !EXTENSOES.has(extname(nome).toLowerCase())) return;
    this.vistos.add(nome);
    // Espera o arquivo parar de crescer (upload/cópia em andamento).
    let tam = -1;
    for (let i = 0; i < 20; i++) {
      const f = Bun.file(arq);
      if (!(await f.exists())) return;
      if (f.size > 0 && f.size === tam) break;
      tam = f.size;
      await Bun.sleep(300);
    }
    const meta = await Bun.file(arq.replace(/\.[^.]+$/, ".json")).json().catch(() => ({}) as any);
    const clienteId = meta.clienteId ?? clienteDoArquivo(nome);
    const canal = meta.canal ?? "app";
    this.fila.push(async () => {
      const t = await criarTrabalho(arq, clienteId, canal);
      const dirProc = join(CONFIG.dirCaixaEntrada, "processados");
      await mkdir(dirProc, { recursive: true });
      await rename(arq, join(dirProc, `${t.id}${extname(nome)}`)).catch(() => {});
      return t;
    });
    void this.drenar();
  }

  private async drenar() {
    if (this.rodando) return;
    this.rodando = true;
    try {
      for (let item = this.fila.shift(); item; item = this.fila.shift()) {
        const t = typeof item === "function" ? await item() : item;
        const e = await processar(t, this.op);
        for (const o of this.ouvintes) o(t.id, e.situacao);
      }
    } finally {
      this.rodando = false;
    }
  }

  /** Retoma trabalhos interrompidos (processo caiu no meio) e passa a observar a pasta. */
  async iniciar() {
    await mkdir(CONFIG.dirCaixaEntrada, { recursive: true });
    await mkdir(CONFIG.dirTrabalhos, { recursive: true });
    for (const id of await readdir(CONFIG.dirTrabalhos)) {
      const dir = join(CONFIG.dirTrabalhos, id);
      const e = await lerEstado(dir).catch(() => null);
      if (e && (e.situacao === "processando" || e.situacao === "na_fila")) this.fila.push({ id, dir });
    }
    for (const n of await readdir(CONFIG.dirCaixaEntrada)) void this.arquivoNovo(join(CONFIG.dirCaixaEntrada, n));
    watch(CONFIG.dirCaixaEntrada, (_ev, nome) => {
      if (nome) void this.arquivoNovo(join(CONFIG.dirCaixaEntrada, nome.toString()));
    });
    // Rede de segurança: fs.watch perde eventos em alguns sistemas de arquivos.
    setInterval(async () => {
      for (const n of await readdir(CONFIG.dirCaixaEntrada).catch(() => [] as string[])) void this.arquivoNovo(join(CONFIG.dirCaixaEntrada, n));
    }, 5000);
    void this.drenar();
    console.log(`observando ${CONFIG.dirCaixaEntrada}`);
  }
}
