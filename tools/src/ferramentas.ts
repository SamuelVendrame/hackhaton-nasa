import "./core/env";
import { z } from "zod";
import { hoje, somarDias } from "./core/calc";
import type { Local } from "./core/tipos";
import { compararEstrategias, analisarPlantio } from "./mapeamentos/analise";
import { chuvaJanela, climaJanela, condicaoRecente, estresseCalor, riscoGeada, umidadeSolo, ventoPrevisto } from "./mapeamentos/clima";
import { janelaPlantio } from "./mapeamentos/janela-plantio";
import { localizar, resolverLocal } from "./mapeamentos/localizacao";
import { monitorarPlantio, resumoPeriodico } from "./mapeamentos/monitoramento";
import { culturasRegiao, estacoesProximas, precosMercado, soloEstimado } from "./mapeamentos/regiao";
import { relevo } from "./mapeamentos/relevo";
import { avaliarRotacao } from "./mapeamentos/rotacao";
import { chuvaSatelite, umidadeSoloSatelite, vegetacao } from "./mapeamentos/satelite";

/**
 * Catálogo único das ferramentas. A CLI e o servidor MCP leem daqui;
 * um job agendado ou outro fluxo pode importar `executar` diretamente.
 */

const local = {
  cep: z.string().optional().describe("CEP (8 dígitos). Ex.: 87209000 (Cianorte/PR)"),
  lat: z.number().optional().describe("Latitude do talhão (preferível ao CEP)"),
  lon: z.number().optional().describe("Longitude do talhão"),
  ibge: z.string().optional().describe("Código IBGE do município (7 dígitos)"),
  municipio: z.string().optional(),
  uf: z.string().optional(),
};

const periodo = {
  inicio: z.string().optional().describe("Início AAAA-MM-DD (padrão: hoje)"),
  fim: z.string().optional().describe("Fim AAAA-MM-DD (padrão: início + 30 dias)"),
};

type Args = Record<string, any>;
const resolver = (a: Args): Promise<Local> => resolverLocal(a);
const janela = (a: Args) => {
  const inicio = a.inicio ?? hoje();
  return { inicio, fim: a.fim ?? somarDias(inicio, 30) };
};

export interface Ferramenta {
  nome: string;
  descricao: string;
  /** Agrupamento por fonte: ferramentas do mesmo grupo compartilham as mesmas chamadas (cache). */
  grupo: "local" | "clima" | "zarc" | "regiao" | "mercado" | "rotacao" | "composta" | "monitoramento" | "satelite";
  entrada: Record<string, z.ZodTypeAny>;
  executar: (a: Args) => Promise<unknown>;
}

export const FERRAMENTAS: Ferramenta[] = [
  {
    nome: "localizar",
    grupo: "local",
    descricao: "Resolve CEP, coordenada ou município em coordenadas + código IBGE. Base para as demais ferramentas.",
    entrada: local,
    executar: (a) => localizar(a),
  },
  {
    nome: "clima_janela",
    grupo: "clima",
    descricao:
      "Panorama de clima de uma janela (passada ou futura): temperatura, chuva, geada e calor, comparados com a normal de 20 anos. Usa observação, previsão de 16 dias, previsão sazonal (até ~7 meses) ou climatologia, conforme a data.",
    entrada: { ...local, ...periodo, limiarCalor: z.number().optional().describe("Máxima (°C) considerada estresse; padrão 34") },
    executar: async (a) => climaJanela(await resolver(a), janela(a), a.limiarCalor),
  },
  {
    nome: "risco_geada",
    grupo: "clima",
    descricao: "Recorte de clima_janela só para frio: dias previstos com mínima ≤ 3 °C, probabilidade sazonal de geada e em quantos dos últimos 20 anos geou na mesma janela. Use para \"vai gear?\".",
    entrada: { ...local, ...periodo },
    executar: async (a) => riscoGeada(await resolver(a), janela(a)),
  },
  {
    nome: "estresse_calor",
    grupo: "clima",
    descricao: "Recorte de clima_janela só para calor: dias com máxima acima do limiar (padrão 34 °C) na janela, previstos e na média histórica.",
    entrada: { ...local, ...periodo, limiar: z.number().optional().describe("Máxima diária (°C); padrão 34") },
    executar: async (a) => estresseCalor(await resolver(a), janela(a), a.limiar),
  },
  {
    nome: "chuva_janela",
    grupo: "clima",
    descricao: "Recorte de clima_janela só para chuva FUTURA ou de uma janela: total contra a normal (abaixo/normal/acima), faixa provável, veranico e dias de chuva forte. Para o que já choveu, use chuva_satelite ou condicao_recente.",
    entrada: { ...local, ...periodo },
    executar: async (a) => chuvaJanela(await resolver(a), janela(a)),
  },
  {
    nome: "vento_previsto",
    grupo: "clima",
    descricao: "Vento e rajadas previstos para os próximos 16 dias.",
    entrada: { ...local, limiarRajadaKmh: z.number().optional() },
    executar: async (a) => ventoPrevisto(await resolver(a), a.limiarRajadaKmh),
  },
  {
    nome: "umidade_solo",
    grupo: "clima",
    descricao: "Umidade do solo na zona das raízes por MODELO (reanálise NASA POWER + previsão): últimos 30 dias contra a normal e tendência dos próximos dias. Para medição por satélite da camada superficial, use umidade_solo_satelite.",
    entrada: local,
    executar: async (a) => umidadeSolo(await resolver(a)),
  },
  {
    nome: "condicao_recente",
    grupo: "clima",
    descricao: "Chuva e temperatura dos últimos 30 e 90 dias por REANÁLISE (NASA POWER, atraso de ~4 dias) comparadas com a normal: seca ou excesso recente. Rápida, sem token. chuva_satelite mede o mesmo por satélite, com mais detalhe diário.",
    entrada: local,
    executar: async (a) => condicaoRecente(await resolver(a)),
  },
  {
    nome: "janela_plantio",
    grupo: "zarc",
    descricao: "Consulta o ZARC (zoneamento oficial de risco climático): se a cultura está indicada para plantio na data, com que risco, e quais as janelas do ano.",
    entrada: {
      ...local,
      cultura: z.string().describe("Ex.: soja, milho, milho-safrinha, feijao, trigo"),
      data: z.string().optional().describe("Data pretendida de plantio AAAA-MM-DD"),
      solo: z.string().optional().describe("Classe de solo do ZARC (AD1..AD6, Arenoso, Textura média, Argiloso)"),
      manejo: z.string().optional().describe("Sequeiro (padrão) ou Irrigado"),
    },
    executar: async (a) => janelaPlantio(await resolver(a), a.cultura, a.data, a.solo, a.manejo),
  },
  {
    nome: "culturas_regiao",
    grupo: "regiao",
    descricao: "Culturas mais plantadas no município (IBGE/PAM): área, produção, rendimento e variação em 5 anos.",
    entrada: local,
    executar: async (a) => culturasRegiao(await resolver(a)),
  },
  {
    nome: "solo_estimado",
    grupo: "regiao",
    descricao: "Estimativa de solo no ponto (SoilGrids, 250 m): textura, pH, carbono orgânico, CTC. Só faz sentido com lat/lon do talhão: com a coordenada do CEP (cidade) costuma vir sem dado. Não substitui a análise de solo.",
    entrada: local,
    executar: async (a) => soloEstimado(await resolver(a)),
  },
  {
    nome: "relevo",
    grupo: "regiao",
    descricao: "Altitude, declividade e posição no relevo (baixada, encosta, topo): risco de erosão e de geada local. Com a coordenada do CEP o resultado descreve a cidade, não o talhão.",
    entrada: local,
    executar: async (a) => relevo(await resolver(a)),
  },
  {
    nome: "estacoes_proximas",
    grupo: "regiao",
    descricao: "Estações meteorológicas do INMET mais próximas do local.",
    entrada: { ...local, n: z.number().optional() },
    executar: async (a) => estacoesProximas(await resolver(a), a.n),
  },
  {
    nome: "precos_mercado",
    grupo: "mercado",
    descricao: "Preço recebido pelo produtor no Paraná (SEAB/DERAL): semana atual por regional e tendência mensal.",
    entrada: { ...local, produto: z.string().describe("Ex.: soja, milho, feijao, trigo, mandioca") },
    executar: async (a) => precosMercado(a.produto, a.cep || a.lat || a.ibge || a.municipio ? await resolver(a) : undefined),
  },
  {
    nome: "avaliar_rotacao",
    grupo: "rotacao",
    descricao: "Sinais de rotação (família, nitrogênio, doenças de solo em comum) ao plantar uma cultura após o histórico informado.",
    entrada: {
      historico: z.array(z.string()).describe("Culturas anteriores em ordem cronológica; a última é a atual"),
      proposta: z.string(),
    },
    executar: async (a) => avaliarRotacao(a.historico, a.proposta),
  },
  {
    nome: "analisar_plantio",
    grupo: "composta",
    descricao: "Evidências para UMA cultura numa data (cultura e dataPlantio obrigatórios): clima do ciclo, ZARC, preço, região, solo, relevo, condição recente e rotação. Quando o produtor está decidindo entre opções, prefira comparar_estrategias, que já roda esta para cada opção.",
    entrada: {
      ...local,
      cultura: z.string(),
      dataPlantio: z.string().optional(),
      historico: z.array(z.string()).optional(),
      solo: z.string().optional(),
    },
    executar: async (a) => analisarPlantio(await resolver(a), a as any),
  },
  {
    nome: "comparar_estrategias",
    grupo: "composta",
    descricao: "Principal ferramenta para \"devo plantar X?\": compara a cultura pretendida (cultura e dataPlantio obrigatórios; historico = culturas anteriores, do mais antigo ao mais recente) com 2 alternativas (alternativas[] opcional; senão escolhidas pelo ZARC para a data). Cada opção traz clima do ciclo, ZARC, preço, região, solo, relevo, condição recente, rotação e sinais a favor/atenção. Não chame analisar_plantio, clima_janela, janela_plantio, precos_mercado ou avaliar_rotacao junto: já estão incluídas. Leva de segundos a ~2 min.",
    entrada: {
      ...local,
      cultura: z.string(),
      dataPlantio: z.string().optional(),
      historico: z.array(z.string()).optional(),
      alternativas: z.array(z.string()).optional(),
      solo: z.string().optional(),
    },
    executar: async (a) => compararEstrategias(await resolver(a), a as any),
  },
  {
    nome: "monitorar_plantio",
    grupo: "monitoramento",
    descricao: "Fotografa o cenário climático de um plantio e compara com a foto anterior, gerando alertas de mudança (geada, chuva forte, calor, seca, vento).",
    entrada: {
      ...local,
      id: z.string(),
      cultura: z.string(),
      dataPlantio: z.string(),
      dataColheita: z.string().optional(),
      fotoAnterior: z.any().optional(),
    },
    executar: async (a) =>
      monitorarPlantio({ id: a.id, local: await resolver(a), cultura: a.cultura, dataPlantio: a.dataPlantio, dataColheita: a.dataColheita }, a.fotoAnterior ?? null),
  },
  {
    nome: "resumo_periodico",
    grupo: "monitoramento",
    descricao: "Resumo do clima dos próximos 7 (semanal) ou 30 dias (mensal), para os disparos de WhatsApp.",
    entrada: { ...local, tipo: z.enum(["semanal", "mensal"]).optional() },
    executar: async (a) => resumoPeriodico(await resolver(a), a.tipo),
  },
  {
    nome: "vegetacao_ndvi",
    grupo: "satelite",
    descricao:
      "Verde da lavoura medido por satélite (NASA MODIS, NDVI a cada 16 dias, 250 m): situação atual, tendência, comparação com a mesma época em 5 anos e períodos de solo exposto no último ano. Com lat/lon do talhão mede a lavoura; com o CEP devolve o entorno da cidade (avisado em limitacoes). Lenta: a 1ª consulta de um ponto pode levar 2–5 min (depois fica em cache).",
    entrada: { ...local, data: z.string().optional().describe("Data de referência AAAA-MM-DD (padrão: hoje)") },
    executar: async (a) => vegetacao(await resolver(a), a.data),
  },
  {
    nome: "umidade_solo_satelite",
    grupo: "satelite",
    descricao:
      "Umidade da camada superficial do solo medida pelo satélite NASA SMAP (9 km, a cada 2–3 dias) nos últimos dias, comparada com a mesma janela em anos anteriores. Exige EARTHDATA_TOKEN (sem ele, devolve erro explicando). 1ª consulta ~30–60 s.",
    entrada: {
      ...local,
      dias: z.number().optional().describe("Quantos dias para trás (padrão 30)"),
      anosHistorico: z.number().optional().describe("Anos anteriores para comparar (padrão 2)"),
    },
    executar: async (a) => umidadeSoloSatelite(await resolver(a), a.dias, a.anosHistorico),
  },
  {
    nome: "chuva_satelite",
    grupo: "satelite",
    descricao:
      "Quanto choveu de fato nos últimos dias segundo o satélite NASA GPM (IMERG, ~10 km, diário): total, dias de chuva, veranico, maior chuva, comparado com a normal de 20 anos e conferido com a reanálise POWER. Exige EARTHDATA_TOKEN (sem ele, devolve erro explicando). 1ª consulta ~20–40 s.",
    entrada: { ...local, dias: z.number().optional().describe("Quantos dias para trás (padrão 30)") },
    executar: async (a) => chuvaSatelite(await resolver(a), a.dias),
  },
];

export function acharFerramenta(nome: string) {
  return FERRAMENTAS.find((f) => f.nome === nome);
}

export async function executar(nome: string, args: Args) {
  const f = acharFerramenta(nome);
  if (!f) throw new Error(`ferramenta desconhecida: ${nome}`);
  const validado = z.object(f.entrada).parse(args);
  return f.executar(validado);
}
