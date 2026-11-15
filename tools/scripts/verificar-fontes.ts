/**
 * Roda todas as ferramentas para um local de teste e grava:
 *   docs/dados/verificacao.md      — status, tempo e resumo de cada ferramenta
 *   docs/dados/amostras/<nome>.json — resposta completa (para estudar o formato)
 * Uso: bun run verificar [--cep 87209000]
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { hoje, somarDias } from "../src/core/calc";
import { executar } from "../src/ferramentas";

const i = process.argv.indexOf("--cep");
const cep = i > 0 ? process.argv[i + 1]! : "87209000";
const raiz = join(import.meta.dir, "..", "..", "docs", "dados");
await mkdir(join(raiz, "amostras"), { recursive: true });

const h = hoje();
const proximoMes = somarDias(h, 30);
const casos: [string, Record<string, unknown>][] = [
  ["localizar", { cep }],
  ["clima_janela", { cep, inicio: proximoMes, fim: somarDias(proximoMes, 120) }],
  ["risco_geada", { cep, inicio: `${Number(h.slice(0, 4)) + 1}-05-01`, fim: `${Number(h.slice(0, 4)) + 1}-07-31` }],
  ["estresse_calor", { cep, inicio: h, fim: somarDias(h, 60), limiar: 35 }],
  ["chuva_janela", { cep, inicio: h, fim: somarDias(h, 30) }],
  ["vento_previsto", { cep }],
  ["umidade_solo", { cep }],
  ["condicao_recente", { cep }],
  ["janela_plantio", { cep, cultura: "soja", data: proximoMes }],
  ["culturas_regiao", { cep }],
  ["solo_estimado", { cep, lat: -23.7, lon: -52.56 }],
  ["relevo", { cep, lat: -23.7, lon: -52.56 }],
  ["estacoes_proximas", { cep }],
  ["precos_mercado", { cep, produto: "soja" }],
  ["avaliar_rotacao", { historico: ["batata"], proposta: "soja" }],
  ["analisar_plantio", { cep, cultura: "soja", dataPlantio: proximoMes, historico: ["batata"] }],
  ["comparar_estrategias", { cep, cultura: "soja", dataPlantio: proximoMes, historico: ["batata"] }],
  ["monitorar_plantio", { cep, id: "teste-1", cultura: "soja", dataPlantio: proximoMes }],
  ["resumo_periodico", { cep, tipo: "semanal" }],
  ["resumo_periodico", { cep, tipo: "mensal" }],
  ["chuva_satelite", { lat: -23.7, lon: -52.56 }],
  ["umidade_solo_satelite", { lat: -23.7, lon: -52.56 }],
  ["vegetacao_ndvi", { lat: -23.7, lon: -52.56 }],
];

const linhas = [
  `# Verificação das ferramentas`,
  "",
  `Gerado em ${new Date().toISOString()} para o CEP ${cep}. Respostas completas em [amostras/](amostras/).`,
  "",
];
for (const [nome, args] of casos) {
  const t0 = Date.now();
  const arquivo = nome === "resumo_periodico" ? `${nome}_${args.tipo}` : nome;
  try {
    const r: any = await executar(nome, args);
    await Bun.write(join(raiz, "amostras", `${arquivo}.json`), JSON.stringify(r, null, 2));
    const s = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`ok   ${arquivo} (${s}s)`);
    linhas.push(`## ${arquivo} — ok (${s} s)`, "", `Entrada: \`${JSON.stringify(args)}\``, "", ...r.resumo.map((x: string) => `- ${x}`), "");
  } catch (e) {
    console.log(`ERRO ${arquivo}: ${(e as Error).message}`);
    linhas.push(`## ${arquivo} — ERRO`, "", `Entrada: \`${JSON.stringify(args)}\``, "", "```", (e as Error).message, "```", "");
  }
}
await Bun.write(join(raiz, "verificacao.md"), linhas.join("\n"));
