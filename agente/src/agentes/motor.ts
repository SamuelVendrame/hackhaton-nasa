import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { z } from "zod";
import { CONFIG } from "../config";
import { esquemaJson } from "../contratos";

/**
 * Um agente = papel + prompt de sistema + entrada JSON + esquema de saída.
 * O motor decide onde ele roda. A pipeline não sabe qual motor está em uso.
 */
export interface PedidoAgente<S extends z.ZodTypeAny> {
  papel: "analista" | "comunicador";
  /** Caminho do prompt de sistema (prompts/*.md). */
  promptSistema: string;
  entrada: unknown;
  esquema: S;
  modelo: string;
  /** Ferramentas MCP liberadas (ex.: o servidor field-shift-dados para o analista). */
  usaFerramentas: boolean;
  /** Pasta do trabalho, para registrar pedido, resposta e log da sessão. */
  dirTrabalho: string;
  /** Sufixo para tentativas repetidas (comunicador corrigido). */
  sufixo?: string;
}

export interface RespostaAgente<T> {
  saida: T;
  /** Ferramentas chamadas, na ordem (quando o motor consegue observar). */
  ferramentas: string[];
  ms: number;
  custoUsd?: number;
  sessao?: string;
}

export interface MotorAgente {
  nome: string;
  executar<S extends z.ZodTypeAny>(p: PedidoAgente<S>): Promise<RespostaAgente<z.infer<S>>>;
}

/** Extrai o primeiro objeto JSON de um texto (tolera cercas ```json). */
export function extrairJson(texto: string): unknown {
  const limpo = texto.replace(/```(?:json)?/g, "").trim();
  const ini = limpo.indexOf("{");
  const fim = limpo.lastIndexOf("}");
  if (ini < 0 || fim <= ini) throw new Error(`sem JSON na resposta do agente: ${texto.slice(0, 200)}`);
  return JSON.parse(limpo.slice(ini, fim + 1));
}

/* ------------------------- Motor 1: Claude Code headless ------------------------- */

/** Gera config/mcp.json com o caminho absoluto do servidor de ferramentas (e um vazio para o comunicador). */
export async function garantirConfigMcp() {
  const dir = join(CONFIG.raiz, "config");
  await mkdir(dir, { recursive: true });
  const servidor = join(CONFIG.dirTools, "src", "mcp.ts").replaceAll("\\", "/");
  await Bun.write(join(dir, "mcp.json"), JSON.stringify({ mcpServers: { "field-shift-dados": { command: "bun", args: ["run", servidor], alwaysLoad: true } } }, null, 2));
  await Bun.write(join(dir, "mcp-vazio.json"), JSON.stringify({ mcpServers: {} }, null, 2));
}

/**
 * Roda o agente como uma sessão `claude -p` isolada: prompt de sistema próprio, só o servidor
 * MCP de dados (nenhuma ferramenta de arquivo/terminal), saída validada por JSON Schema.
 * Requer o Claude Code logado uma vez neste computador (`claude` → /login).
 */
export const motorClaude: MotorAgente = {
  nome: "claude-code",
  async executar(p) {
    const t0 = Date.now();
    const nome = `${p.papel}${p.sufixo ?? ""}`;
    await mkdir(p.dirTrabalho, { recursive: true });
    await garantirConfigMcp();
    const esquema = JSON.stringify(esquemaJson(p.esquema));
    const args = [
      CONFIG.claudeBin,
      "-p",
      "--output-format", "stream-json",
      "--verbose",
      "--model", p.modelo,
      "--system-prompt-file", p.promptSistema,
      "--json-schema", esquema,
      "--no-session-persistence",
      "--strict-mcp-config",
      "--mcp-config", join(CONFIG.raiz, "config", p.usaFerramentas ? "mcp.json" : "mcp-vazio.json"),
      "--tools", "",
      "--effort", p.papel === "comunicador" ? CONFIG.esforcoComunicador : CONFIG.esforcoAnalista,
      ...(p.usaFerramentas ? ["--allowedTools", "mcp__field-shift-dados"] : []),
    ];
    const pedido = `Contexto (JSON):\n\n${JSON.stringify(p.entrada, null, 2)}\n\nEntregue o resultado chamando a ferramenta StructuredOutput uma única vez (não escreva o JSON como texto).${p.usaFerramentas ? " Quando precisar de mais de uma ferramenta de dados, peça todas na mesma mensagem: elas rodam em paralelo." : ""}`;
    await Bun.write(join(p.dirTrabalho, `${nome}.pedido.json`), JSON.stringify({ modelo: p.modelo, entrada: p.entrada }, null, 2));
    const proc = Bun.spawn(args, {
      cwd: join(CONFIG.raiz, "config"),
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
      // Sem isso o claude -p começa antes de o servidor MCP conectar e o agente responde sem ferramentas.
      env: { ...process.env, CLAUDECODE: undefined, CLAUDE_CODE_ENTRYPOINT: undefined, MCP_CONNECTION_NONBLOCKING: "false", MCP_TIMEOUT: "60000",
        // O comunicador só reescreve uma análise pronta: raciocínio estendido ali custava 5–13 mil tokens e até 90 s.
        ...(p.papel === "comunicador" && !CONFIG.raciocinioComunicador ? { CLAUDE_CODE_DISABLE_THINKING: "1", MAX_THINKING_TOKENS: "0" } : {}) } as any,
    });
    proc.stdin!.write(pedido);
    proc.stdin!.end();
    const timer = setTimeout(() => proc.kill(), CONFIG.timeoutAgenteMs);
    const [stdout, stderr, codigo] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
    clearTimeout(timer);
    await Bun.write(join(p.dirTrabalho, `${nome}.sessao.jsonl`), stdout);

    const eventos = stdout.split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    const ferramentas: string[] = [];
    for (const e of eventos)
      if (e.type === "assistant")
        for (const c of e.message?.content ?? []) if (c.type === "tool_use" && c.name !== "StructuredOutput") ferramentas.push(String(c.name).replace(/^mcp__field-shift-dados__/, ""));
    const fim = eventos.findLast((e: any) => e.type === "result");
    if (!fim) throw new Error(`claude terminou sem resultado (código ${codigo}): ${stderr.slice(0, 300)}`);
    if (fim.is_error) throw new Error(`claude: ${String(fim.result ?? fim.subtype).slice(0, 300)}`);
    const bruto = fim.structured_output ?? extrairJson(String(fim.result ?? ""));
    const saida = p.esquema.parse(bruto);
    await Bun.write(join(p.dirTrabalho, `${nome}.json`), JSON.stringify(saida, null, 2));
    return { saida, ferramentas, ms: Date.now() - t0, custoUsd: fim.total_cost_usd, sessao: fim.session_id };
  },
};

/* --------------------- Motor 2: handoff por arquivos (teste/humano) --------------------- */

/**
 * Grava `{papel}.pedido.json` (prompt + entrada + esquema) e espera `{papel}.resposta.json`.
 * Serve para rodar a pipeline com outro executor (um subagente, um humano, um teste)
 * sem mudar nada no fluxo.
 */
export const motorArquivo: MotorAgente = {
  nome: "arquivo",
  async executar(p) {
    const t0 = Date.now();
    const nome = `${p.papel}${p.sufixo ?? ""}`;
    await mkdir(p.dirTrabalho, { recursive: true });
    const arqResposta = join(p.dirTrabalho, `${nome}.resposta.json`);
    await Bun.write(
      join(p.dirTrabalho, `${nome}.pedido.json`),
      JSON.stringify(
        {
          papel: p.papel,
          modelo: p.modelo,
          promptSistema: p.promptSistema,
          usaFerramentas: p.usaFerramentas,
          instrucao: `Siga o prompt de sistema e grave a saída (JSON no esquema) em ${arqResposta}`,
          esquema: esquemaJson(p.esquema),
          entrada: p.entrada,
        },
        null,
        2,
      ),
    );
    while (Date.now() - t0 < CONFIG.timeoutAgenteMs) {
      const f = Bun.file(arqResposta);
      if (await f.exists()) {
        const bruto = await f.json().catch(() => null);
        if (bruto) {
          const { ferramentasUsadas, ...resto } = bruto as any;
          const saida = p.esquema.parse(p.papel === "analista" ? bruto : resto);
          await Bun.write(join(p.dirTrabalho, `${nome}.json`), JSON.stringify(saida, null, 2));
          const ferramentas = Array.isArray(ferramentasUsadas) ? ferramentasUsadas.map((f: any) => f.nome ?? String(f)) : [];
          return { saida, ferramentas, ms: Date.now() - t0 };
        }
      }
      await Bun.sleep(1000);
    }
    throw new Error(`nenhuma resposta em ${arqResposta} após ${CONFIG.timeoutAgenteMs / 1000}s`);
  },
};

export function motorAtual(): MotorAgente {
  return CONFIG.motorAgente === "arquivo" ? motorArquivo : motorClaude;
}
