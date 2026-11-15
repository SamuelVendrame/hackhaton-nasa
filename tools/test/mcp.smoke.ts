/**
 * Teste de fumaça do servidor MCP (usa rede): sobe o servidor via stdio,
 * lista as ferramentas e chama uma delas. Rodar com: bun run test/mcp.smoke.ts
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transporte = new StdioClientTransport({ command: "bun", args: ["run", `${import.meta.dir}/../src/mcp.ts`] });
const cliente = new Client({ name: "smoke", version: "0.0.0" });
await cliente.connect(transporte);
const { tools } = await cliente.listTools();
console.log(`${tools.length} ferramentas:`, tools.map((t) => t.name).join(", "));
const r: any = await cliente.callTool({ name: "avaliar_rotacao", arguments: { historico: ["batata"], proposta: "soja" } });
console.log(JSON.parse(r.content[0].text).resumo);
const r2: any = await cliente.callTool({ name: "precos_mercado", arguments: { produto: "soja", cep: "87209000" } });
console.log(JSON.parse(r2.content[0].text).resumo);
await cliente.close();
