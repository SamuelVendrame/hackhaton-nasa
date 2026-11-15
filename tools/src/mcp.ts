#!/usr/bin/env bun
/**
 * Servidor MCP (stdio) que expõe todas as ferramentas do catálogo.
 * Configuração de cliente MCP:
 *   { "command": "bun", "args": ["run", "<caminho>/tools/src/mcp.ts"] }
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { FERRAMENTAS } from "./ferramentas";

const servidor = new McpServer({ name: "field-shift-dados", version: "0.1.0" });

for (const f of FERRAMENTAS) {
  servidor.registerTool(
    f.nome,
    { description: f.descricao, inputSchema: f.entrada },
    async (args: Record<string, unknown>) => {
      try {
        const r = await f.executar(z.object(f.entrada).parse(args));
        return { content: [{ type: "text" as const, text: JSON.stringify(r) }] };
      } catch (e) {
        return { isError: true, content: [{ type: "text" as const, text: `Erro: ${(e as Error).message}` }] };
      }
    },
  );
}

await servidor.connect(new StdioServerTransport());
