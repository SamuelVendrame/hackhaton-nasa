import { z } from "zod";

/**
 * Contratos de dados entre as etapas da pipeline. Cada etapa lê o artefato da
 * anterior, valida com o esquema e grava o seu em trabalhos/{id}/. Assim cada
 * agente recebe só o que precisa, e qualquer etapa pode ser refeita isoladamente.
 *
 *  entrada ─► transcricao ─► contexto ─► analise ─► resposta ─► audio ─► verificacao ─► saida
 *  (canal)    (Whisper)      (perfil +   (agente    (agente      (TTS)    (Whisper de     (canal)
 *                             memória)    analista)  comunicador)          volta + regras)
 */

/* ------------------------------- Cliente ------------------------------- */

export const PerfilCliente = z.object({
  id: z.string(),
  nome: z.string(),
  /** Como o produtor gosta de ser chamado: "Seu João", "João", "Dona Maria". */
  comoChamar: z.string(),
  telefone: z.string().optional(),
  local: z.object({
    cep: z.string().optional(),
    lat: z.number().optional(),
    lon: z.number().optional(),
    municipio: z.string().optional(),
    uf: z.string().optional(),
    /** O ponto é do talhão (marcado no mapa) ou só o CEP da propriedade? */
    pontoDoTalhao: z.boolean().default(false),
  }),
  propriedade: z
    .object({
      areaHa: z.number().optional(),
      irrigacao: z.boolean().optional(),
      culturaAtual: z.string().optional(),
      /** Do mais antigo para o mais recente: ["soja", "milho-safrinha", "batata"]. */
      historicoPlantios: z.array(z.string()).default([]),
      tipoSolo: z.string().optional(),
      cooperativa: z.string().optional(),
    })
    .default({ historicoPlantios: [] }),
  comunicacao: z
    .object({
      /** basico: sem termos técnicos; intermediario: termos comuns do campo; tecnico: agrônomo/técnico. */
      nivelTecnico: z.enum(["basico", "intermediario", "tecnico"]).default("basico"),
      /** curta ≈ 30–45 s de fala; media ≈ 60–90 s. */
      tamanhoResposta: z.enum(["curta", "media"]).default("curta"),
      formalidade: z.enum(["informal", "respeitosa"]).default("respeitosa"),
      /** Expressões e jeitos de falar que o produtor usa (aprendido nas conversas). */
      expressoes: z.array(z.string()).default([]),
    })
    .default({ nivelTecnico: "basico", tamanhoResposta: "curta", formalidade: "respeitosa", expressoes: [] }),
  /** Fatos que o produtor já contou e que mudam a análise (pragas na área, contrato fechado...). */
  observacoes: z.array(z.string()).default([]),
});
export type PerfilCliente = z.infer<typeof PerfilCliente>;

export const Turno = z.object({
  quando: z.string(),
  produtor: z.string(),
  consultor: z.string(),
  intencao: z.string().optional(),
});
export type Turno = z.infer<typeof Turno>;

/* ------------------------------- Etapas ------------------------------- */

export const Entrada = z.object({
  id: z.string(),
  recebidoEm: z.string(),
  canal: z.enum(["app", "whatsapp", "teste"]),
  clienteId: z.string(),
  arquivoOriginal: z.string(),
  mime: z.string().optional(),
});
export type Entrada = z.infer<typeof Entrada>;

export const Transcricao = z.object({
  texto: z.string(),
  duracaoAudioS: z.number(),
  modelo: z.string(),
  tempoProcessamentoMs: z.number(),
});
export type Transcricao = z.infer<typeof Transcricao>;

/** Pacote montado de forma determinística para o analista: pergunta + quem pergunta + memória. */
export const Contexto = z.object({
  pergunta: z.string(),
  hoje: z.string(),
  cliente: PerfilCliente,
  ultimasConversas: z.array(Turno),
});
export type Contexto = z.infer<typeof Contexto>;

export const Estrategia = z.object({
  nome: z.string().describe("Ex.: 'Soja em meados de dezembro (o que você pensou)'"),
  ehAPretendida: z.boolean().describe("true se é o que o produtor disse que pretendia fazer"),
  descricao: z.string(),
  motivos: z.array(z.string()),
  beneficios: z.array(z.string()),
  riscos: z.array(z.string()),
  evidencias: z.array(z.string()).describe("Fatos com número e fonte, copiados dos resultados das ferramentas"),
  avaliacao: z.enum(["favoravel", "favoravel_com_cuidados", "desfavoravel", "inconclusiva"]),
});

/** Saída do agente analista: só fatos e estratégias, sem preocupação com o tom. */
export const Analise = z.object({
  intencao: z.enum(["decisao_plantio", "clima", "mercado", "solo_lavoura", "rotacao", "monitoramento", "saudacao", "fora_do_escopo", "outra"]),
  perguntaEntendida: z.string().describe("A pergunta reescrita de forma completa, com cultura, data e local quando houver"),
  ferramentasUsadas: z.array(z.object({ nome: z.string(), motivo: z.string() })),
  achados: z
    .array(z.object({ fato: z.string(), fonte: z.string(), ferramenta: z.string() }))
    .describe("Fatos relevantes extraídos dos resultados; todo número da resposta final tem de estar aqui"),
  estrategias: z.array(Estrategia).describe("Ao menos 3 quando o produtor pede ajuda para decidir; vazio para perguntas simples"),
  sugestaoPrincipal: z.string().describe("O que o consultor sugeriria considerar, em uma frase, sem impor"),
  riscos: z.array(z.string()),
  lacunas: z.array(z.string()).describe("O que não sabemos e mudaria a sugestão"),
  procurarAgronomo: z.string().describe("Quando e por que procurar o agrônomo ou a cooperativa; vazio se não se aplica"),
  perguntaDeRetorno: z.string().describe("Uma pergunta para o produtor que destravaria uma resposta melhor; vazio se não precisar"),
  fatosNovosDoCliente: z.array(z.string()).describe("Fatos novos que o produtor contou e devem ir para o perfil (ex.: 'teve nematoide na batata')"),
});
export type Analise = z.infer<typeof Analise>;

/** Saída do agente comunicador: o texto que vira voz. */
export const Resposta = z.object({
  textoFalado: z.string().describe("Texto para ser lido em voz alta: frases curtas, números por extenso quando ajudar"),
  textoTela: z.array(z.string()).describe("3 a 6 tópicos curtos para mostrar na tela do app junto com o áudio"),
  numerosCitados: z.array(z.string()).describe("Cada número que aparece no texto falado, como está escrito"),
  tomAplicado: z.string().describe("Uma linha: como o tom foi ajustado para este produtor"),
});
export type Resposta = z.infer<typeof Resposta>;

export const AudioGerado = z.object({
  arquivoWav: z.string(),
  arquivoOgg: z.string().optional(),
  duracaoS: z.number(),
  motor: z.string(),
});
export type AudioGerado = z.infer<typeof AudioGerado>;

export const Verificacao = z.object({
  aprovado: z.boolean(),
  transcricaoDeVolta: z.string(),
  similaridade: z.number().describe("0 a 1: quanto do texto falado o Whisper reconheceu no áudio gerado"),
  numerosSemLastro: z.array(z.string()),
  frasesImpositivas: z.array(z.string()),
  duracaoS: z.number(),
  problemas: z.array(z.string()),
  avisos: z.array(z.string()),
  tentativa: z.number(),
});
export type Verificacao = z.infer<typeof Verificacao>;

export const EtapaNome = z.enum(["entrada", "transcricao", "contexto", "analise", "resposta", "audio", "verificacao", "saida"]);
export type EtapaNome = z.infer<typeof EtapaNome>;

export const Estado = z.object({
  id: z.string(),
  situacao: z.enum(["na_fila", "processando", "concluido", "falhou", "aguardando_agente"]),
  etapaAtual: EtapaNome.optional(),
  etapas: z.record(z.string(), z.object({ inicio: z.string(), fim: z.string().optional(), ms: z.number().optional(), erro: z.string().optional() })),
  atualizadoEm: z.string(),
  erro: z.string().optional(),
});
export type Estado = z.infer<typeof Estado>;

/** JSON Schema (para o --json-schema do Claude Code) a partir do esquema zod. */
export function esquemaJson(s: z.ZodTypeAny) {
  return z.toJSONSchema(s, { target: "draft-7" });
}
