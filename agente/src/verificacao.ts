import type { Analise, Contexto, PerfilCliente, Resposta } from "./contratos";

/**
 * Verificações determinísticas, sem modelo de IA:
 *  1. o áudio gerado é entendível (Whisper de volta ≈ texto que queríamos falar);
 *  2. todo número falado tem lastro na análise (nada inventado no caminho);
 *  3. a fala sugere em vez de mandar;
 *  4. a análise seguiu o fluxo (ferramentas usadas, 3 estratégias quando é decisão);
 *  5. tamanho e formato adequados para voz.
 */

/* ----------------------------- Normalização de texto ----------------------------- */

const UNIDADES = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "catorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const DEZENAS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const CENTENAS = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

/** Inteiro (0–999.999) por extenso em português, como o Whisper costuma escrever ou a voz fala. */
export function porExtenso(n: number): string {
  if (n < 20) return UNIDADES[n]!;
  if (n < 100) return DEZENAS[Math.floor(n / 10)]! + (n % 10 ? ` e ${UNIDADES[n % 10]}` : "");
  if (n === 100) return "cem";
  if (n < 1000) return CENTENAS[Math.floor(n / 100)]! + (n % 100 ? ` e ${porExtenso(n % 100)}` : "");
  if (n < 1_000_000) {
    const mil = Math.floor(n / 1000);
    const resto = n % 1000;
    const prefixo = mil === 1 ? "mil" : `${porExtenso(mil)} mil`;
    return prefixo + (resto ? (resto < 100 || resto % 100 === 0 ? " e " : " ") + porExtenso(resto) : "");
  }
  return String(n);
}

/** Minúsculas, sem acento nem pontuação, números → por extenso. Base da comparação de áudio. */
export function normalizarFala(texto: string): string[] {
  const comNumeros = texto
    .toLowerCase()
    // O Whisper escreve "17%" e "30°" onde a voz falou "dezessete por cento" e "trinta graus".
    .replace(/%/g, " por cento ")
    .replace(/°c?/g, " graus ")
    .replace(/(\d+),(\d+)/g, (_, a, b) => `${porExtenso(Number(a))} virgula ${porExtenso(Number(b))}`)
    .replace(/\d+(?:\.\d{3})*/g, (m) => porExtenso(Number(m.replace(/\./g, ""))));
  return comNumeros
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** 1 − WER: fração das palavras de referência reconhecidas na ordem certa (distância de edição). */
export function similaridade(referencia: string, hipotese: string): number {
  const r = normalizarFala(referencia);
  const h = normalizarFala(hipotese);
  if (!r.length) return h.length ? 0 : 1;
  let ant = Array.from({ length: h.length + 1 }, (_, j) => j);
  for (let i = 1; i <= r.length; i++) {
    const atual = [i];
    for (let j = 1; j <= h.length; j++)
      atual[j] = Math.min(ant[j]! + 1, atual[j - 1]! + 1, ant[j - 1]! + (r[i - 1] === h[j - 1] ? 0 : 1));
    ant = atual;
  }
  return Math.max(0, 1 - ant[h.length]! / r.length);
}

/* ----------------------------- Números com lastro ----------------------------- */

/** Números de um texto ("16,7" → 16.7; "1.073" → 1073; datas ISO viram dia, mês e ano). */
export function extrairNumeros(texto: string): number[] {
  const out: number[] = [];
  for (const m of texto.matchAll(/(\d{4})-(\d{2})-(\d{2})/g)) out.push(Number(m[1]), Number(m[2]), Number(m[3]));
  const semDatas = texto.replace(/\d{4}-\d{2}-\d{2}/g, " ");
  for (const m of semDatas.matchAll(/-?\d+(?:\.\d{3})*(?:,\d+)?|-?\d+(?:\.\d+)?/g)) {
    const s = m[0];
    const v = /,/.test(s) ? Number(s.replace(/\./g, "").replace(",", ".")) : /^\-?\d{1,3}(\.\d{3})+$/.test(s) ? Number(s.replace(/\./g, "")) : Number(s);
    if (Number.isFinite(v)) out.push(Math.abs(v));
  }
  return out;
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/**
 * Um número falado tem lastro se existe na análise/contexto com arredondamento de fala
 * (até 10% ou 1 unidade de diferença). Pequenos números de contagem (1–3) são livres.
 */
export function numerosSemLastro(falados: number[], base: number[]): number[] {
  return falados.filter((n) => {
    if (n <= 3) return false;
    return !base.some((b) => Math.abs(b - n) <= Math.max(1, Math.abs(b) * 0.1));
  });
}

export function baseDeNumeros(analise: Analise, contexto: Contexto): number[] {
  const textos = [JSON.stringify(analise), contexto.hoje, JSON.stringify(contexto.cliente)];
  const base = textos.flatMap(extrairNumeros);
  // Datas faladas por extenso ("15 de dezembro") usam o dia; o ano corrente também é livre.
  base.push(Number(contexto.hoje.slice(0, 4)), Number(contexto.hoje.slice(0, 4)) + 1, 20); // "20 anos" de histórico
  return base;
}

/* ----------------------------- Tom impositivo ----------------------------- */

const IMPOSITIVO = [
  /\bvoc[eê] (deve|precisa|tem que|tem de)\b/i,
  /\bo senhor (deve|precisa|tem que)\b/i,
  /^\s*(plante|fa[cç]a|compre|venda|aplique|colha)\b/i,
  /\bn[aã]o plante\b/i,
  /\b[eé] obrigat[oó]rio\b/i,
  /\bcom certeza (vai|ir[aá])\b/i,
  /\bgarant(o|ido|imos)\b/i,
];

export function frasesImpositivas(texto: string): string[] {
  return texto
    .split(/(?<=[.!?])\s+/)
    .filter((f) => IMPOSITIVO.some((r) => r.test(f)))
    // "receituário agronômico é obrigatório" é informação legal, não ordem ao produtor.
    .filter((f) => !/receitu[aá]rio/i.test(f));
}

/* ----------------------------- Fluxo da análise ----------------------------- */

export function problemasDaAnalise(a: Analise, ferramentasObservadas: string[]): string[] {
  const p: string[] = [];
  const usadas = ferramentasObservadas.length ? ferramentasObservadas : a.ferramentasUsadas.map((f) => f.nome);
  const precisaDados = !["saudacao", "fora_do_escopo"].includes(a.intencao);
  if (precisaDados && usadas.length === 0) p.push("A análise não usou nenhuma ferramenta de dados para uma pergunta que precisa de evidência.");
  if (["decisao_plantio", "rotacao"].includes(a.intencao)) {
    if (a.estrategias.length < 3) p.push(`Pergunta de decisão com só ${a.estrategias.length} estratégia(s); o mínimo é 3.`);
    if (!a.estrategias.some((e) => e.ehAPretendida)) p.push("Nenhuma estratégia marcada como a pretendida pelo produtor.");
  }
  if (precisaDados && a.achados.length === 0) p.push("A análise não registrou achados (fatos com fonte).");
  if (/placeholder|lorem ipsum|\bTODO\b/i.test(JSON.stringify(a))) p.push("A análise tem campos de preenchimento (placeholder) em vez de conteúdo.");
  return p;
}

const IGNORAR_NOME = new Set(["a", "o", "em", "de", "do", "da", "com", "sem", "e", "plantar", "plantio", "esperar", "manter", "1a", "2a", "safra", "safrinha", "dias", "semanas", "mes", "meses", "depois", "antes", "agora", "logo", ...UNIDADES, ...DEZENAS, "trinta", "quinze"]);

/**
 * Estratégias da análise que a fala não menciona. Usa a primeira palavra significativa do nome
 * (normalmente a cultura: "Milho 1ª safra..." → "milho"); a pretendida também precisa aparecer.
 */
export function estrategiasOmitidas(r: Resposta, a: Analise): string[] {
  const fala = new Set(normalizarFala(r.textoFalado));
  return a.estrategias
    .filter((e) => {
      const chave = normalizarFala(e.nome.replace(/\(.*?\)/g, "")).find((p) => p.length > 2 && !IGNORAR_NOME.has(p));
      return chave != null && !fala.has(chave);
    })
    .map((e) => e.nome);
}

/* ----------------------------- Texto para voz ----------------------------- */

export function limitePalavras(perfil: PerfilCliente) {
  return perfil.comunicacao.tamanhoResposta === "media" ? 170 : 90;
}

export function problemasDeTexto(r: Resposta, perfil: PerfilCliente, duracaoS?: number): { problemas: string[]; avisos: string[] } {
  const problemas: string[] = [];
  const avisos: string[] = [];
  const palavras = r.textoFalado.split(/\s+/).filter(Boolean).length;
  const limite = limitePalavras(perfil);
  if (palavras > limite * 1.15) problemas.push(`Texto falado com ${palavras} palavras; o limite para este produtor é ${limite}. Corte o menos importante.`);
  if (/[%°$*#/()]|R\$|\bmm\b|\bkm\/h\b/.test(r.textoFalado)) problemas.push("O texto falado tem símbolos ou abreviações; escreva por extenso (por cento, graus, reais, milímetros).");
  if (perfil.comunicacao.nivelTecnico === "basico" && /\b(ZARC|NDVI|SMAP|IMERG|ensemble|tercil|percentil)\b/i.test(r.textoFalado))
    problemas.push("Termo técnico para produtor de nível básico (ZARC, NDVI, ensemble...). Troque por palavras simples.");
  const nome = perfil.comoChamar.trim();
  if (nome) {
    const vezes = r.textoFalado.split(nome).length - 1;
    if (vezes > 2) avisos.push(`O nome "${nome}" aparece ${vezes} vezes; uma basta.`);
  }
  if (r.textoTela.length < 2) avisos.push("Poucos tópicos para a tela.");
  const limiteS = perfil.comunicacao.tamanhoResposta === "media" ? 110 : 60;
  if (duracaoS != null && duracaoS > limiteS)
    problemas.push(`O áudio ficou com ${Math.round(duracaoS)} segundos; para este produtor o máximo é ${limiteS}. Corte pela ordem de prioridade (detalhes vão para a tela).`);
  return { problemas, avisos };
}

export { MESES };
