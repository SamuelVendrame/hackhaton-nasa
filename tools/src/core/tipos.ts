/** Ponto geográfico de análise. `precisao` diz de onde veio a coordenada. */
export interface Local {
  lat: number;
  lon: number;
  /** Código IBGE do município (7 dígitos), quando conhecido. */
  ibge?: string;
  municipio?: string;
  uf?: string;
  cep?: string;
  precisao: "talhao" | "cep" | "municipio" | "informada";
}

/** Período fechado [inicio, fim], datas ISO (AAAA-MM-DD). */
export interface Periodo {
  inicio: string;
  fim: string;
}

/** De onde veio cada dado: entra em toda resposta para o agente citar a evidência. */
export interface Fonte {
  nome: string;
  url?: string;
  /** Resolução espacial aproximada, quando é dado em grade. */
  resolucao?: string;
  /** Tipo do dado: observado/reanálise, previsão, estimativa de modelo, estatística oficial etc. */
  tipo: "observacao" | "reanalise" | "previsao" | "previsao_sazonal" | "climatologia" | "estimativa" | "estatistica_oficial" | "norma_oficial" | "referencia_agronomica";
}

/**
 * Formato comum de saída de toda ferramenta de mapeamento.
 * `dados` é estruturado para o agente; `resumo` são frases curtas e factuais
 * (sem recomendação) que o agente pode usar como evidência.
 */
export interface Resultado<T> {
  ferramenta: string;
  local?: Local;
  periodo?: Periodo;
  resumo: string[];
  dados: T;
  fontes: Fonte[];
  /** Lacunas e cuidados de interpretação: o agente deve repassá-los ao produtor quando relevantes. */
  limitacoes: string[];
  geradoEm: string;
}

/** Linha diária unificada de clima, venha de observação, previsão ou climatologia. */
export interface DiaClima {
  data: string;
  tmin: number | null;
  tmax: number | null;
  chuva: number | null;
  /** Vento máximo/médio em km/h, quando a fonte tiver. */
  vento?: number | null;
  rajada?: number | null;
  /** Faixa de incerteza (previsão sazonal: percentis 10 e 90 dos membros do ensemble). */
  chuvaP10?: number | null;
  chuvaP90?: number | null;
  tminP10?: number | null;
  tmaxP90?: number | null;
  /** Valores de cada membro do ensemble (só previsão sazonal), para calcular probabilidades. */
  membros?: { tmin: (number | null)[]; tmax: (number | null)[]; chuva: (number | null)[] };
  origem: "observado" | "previsao" | "previsao_sazonal" | "climatologia";
}

export function resultado<T>(
  ferramenta: string,
  partes: Omit<Resultado<T>, "ferramenta" | "geradoEm">,
): Resultado<T> {
  return { ferramenta, ...partes, geradoEm: new Date().toISOString() };
}
