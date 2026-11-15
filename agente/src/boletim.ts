import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { lerPerfil, ultimasConversas } from "./clientes";
import { CONFIG } from "./config";
import type { Analise, Contexto, Entrada, Transcricao } from "./contratos";
import { novoId, processar, type OpcoesPipeline } from "./pipeline";

/**
 * Variação da pipeline para os disparos proativos do WhatsApp (semanal/mensal).
 * Não há pergunta nem analista: a ferramenta determinística `resumo_periodico` gera os fatos,
 * que viram uma análise pronta. Daí em diante é o mesmo caminho: comunicador → voz → verificação → saída.
 */

type Executar = (nome: string, args: Record<string, unknown>) => Promise<any>;

async function ferramentas(): Promise<Executar> {
  const m = await import(join(CONFIG.dirTools, "src", "ferramentas.ts"));
  return m.executar as Executar;
}

/** Monta a análise a partir dos resultados das ferramentas (função pura, testável). */
export function analiseDoBoletim(tipo: "semanal" | "mensal", resumo: any, recente: any | null): Analise {
  const fonte = (r: any) => (r?.fontes ?? []).map((f: any) => f.nome).join("; ");
  const achados = [
    ...(resumo?.resumo ?? []).map((fato: string) => ({ fato, fonte: fonte(resumo), ferramenta: "resumo_periodico" })),
    // resumo_periodico já traz os últimos 30 dias; condicao_recente só entra se ele não trouxer.
    ...(((resumo?.resumo ?? []) as string[]).some((l) => /últimos 30 dias/i.test(l)) ? [] : (recente?.resumo ?? []).slice(0, 1)).map((fato: string) => ({ fato, fonte: fonte(recente), ferramenta: "condicao_recente" })),
  ];
  const alertas: string[] = (resumo?.dados?.alertas ?? resumo?.dados?.destaques ?? []).map(String);
  return {
    intencao: "monitoramento",
    perguntaEntendida: `Boletim ${tipo} automático: como fica o tempo no período e o que mudou.`,
    ferramentasUsadas: [
      { nome: "resumo_periodico", motivo: `boletim ${tipo}` },
      ...(recente ? [{ nome: "condicao_recente", motivo: "contexto dos últimos 30 dias" }] : []),
    ],
    achados,
    estrategias: [],
    sugestaoPrincipal: alertas.length ? `Ficar atento a: ${alertas.join("; ")}.` : "",
    riscos: alertas,
    lacunas: [...(resumo?.limitacoes ?? []).slice(0, 2)],
    procurarAgronomo: "",
    perguntaDeRetorno: "Quer que eu veja como isso afeta o seu próximo plantio?",
    fatosNovosDoCliente: [],
  };
}

export async function gerarBoletim(clienteId: string, tipo: "semanal" | "mensal" = "semanal", op: OpcoesPipeline = {}) {
  const executar = await ferramentas();
  const cliente = await lerPerfil(clienteId);
  const local = cliente.local.pontoDoTalhao && cliente.local.lat != null
    ? { lat: cliente.local.lat, lon: cliente.local.lon }
    : cliente.local.cep ? { cep: cliente.local.cep } : { municipio: cliente.local.municipio, uf: cliente.local.uf };
  const [resumo, recente] = await Promise.all([
    executar("resumo_periodico", { ...local, tipo }),
    executar("condicao_recente", local).catch(() => null),
  ]);
  if (resumo?.erro) throw new Error(`resumo_periodico: ${resumo.erro}`);

  const id = novoId(clienteId);
  const dir = join(CONFIG.dirTrabalhos, id);
  await mkdir(dir, { recursive: true });
  const agora = new Date().toISOString();
  const pergunta = `[boletim ${tipo} automático, sem pergunta do produtor]`;
  const entrada: Entrada = { id, recebidoEm: agora, canal: "whatsapp", clienteId, arquivoOriginal: `boletim-${tipo}` };
  const transcricao: Transcricao = { texto: pergunta, duracaoAudioS: 0, modelo: "nenhum", tempoProcessamentoMs: 0 };
  const contexto: Contexto = { pergunta, hoje: agora.slice(0, 10), cliente, ultimasConversas: await ultimasConversas(clienteId) };
  for (const [n, v] of Object.entries({ entrada, transcricao, contexto, analise: analiseDoBoletim(tipo, resumo, recente) }))
    await Bun.write(join(dir, `${n}.json`), JSON.stringify(v, null, 2));
  await Bun.write(join(dir, "analise.meta.json"), JSON.stringify({ motor: "deterministico", ferramentas: ["resumo_periodico", "condicao_recente"] }));
  return processar({ id, dir }, op);
}
