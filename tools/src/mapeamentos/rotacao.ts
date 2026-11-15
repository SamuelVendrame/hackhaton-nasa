import { resultado } from "../core/tipos";
import { acharCultura, type Cultura } from "../conhecimento/culturas";

export interface Sinal {
  tipo: "favoravel" | "atencao";
  texto: string;
}

/** Palavras-chave que identificam o mesmo problema de solo em culturas diferentes. */
const CHAVES_PROBLEMA = ["sclerotinia", "nematoide", "fusarium", "rhizoctonia", "phytophthora", "ralstonia", "cigarrinha", "sclerotium"];

export function problemasCompartilhados(a: Cultura, b: Cultura) {
  const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const pa = a.problemasSolo.map(norm).join(" | ");
  const pb = b.problemasSolo.map(norm).join(" | ");
  return CHAVES_PROBLEMA.filter((k) => pa.includes(k) && pb.includes(k));
}

/**
 * Regras de referência de rotação (sinais, não veredito).
 * `historico` em ordem cronológica: o último item é a cultura atual/anterior ao plantio proposto.
 */
export function avaliarSucessao(historico: string[], proposta: string) {
  const p = acharCultura(proposta);
  const hist = historico.map((h) => ({ nome: h, c: acharCultura(h) }));
  const anterior = hist.at(-1);
  const sinais: Sinal[] = [];
  const lacunas: string[] = [];
  if (!p) lacunas.push(`Cultura "${proposta}" sem ficha de referência; avaliação de rotação limitada.`);
  for (const h of hist) if (!h.c) lacunas.push(`Cultura "${h.nome}" do histórico sem ficha de referência.`);

  if (p && anterior?.c) {
    const a = anterior.c;
    if (a.id === p.id || a.nome.split(" ")[0] === p.nome.split(" ")[0])
      sinais.push({ tipo: "atencao", texto: `Repetir ${p.nome} logo após ${a.nome} mantém pragas e doenças da mesma cultura no solo (monocultura).` });
    else if (a.familia === p.familia)
      sinais.push({ tipo: "atencao", texto: `${a.nome} e ${p.nome} são da mesma família (${p.familia}): a sucessão tende a manter doenças e pragas em comum.` });
    else sinais.push({ tipo: "favoravel", texto: `${p.nome} (${p.familia}) após ${a.nome} (${a.familia}) alterna famílias, o que ajuda a quebrar ciclos de pragas e doenças.` });

    const comuns = problemasCompartilhados(a, p);
    if (comuns.length)
      sinais.push({ tipo: "atencao", texto: `Problemas de solo em comum entre ${a.nome} e ${p.nome}: ${comuns.join(", ")}. Vale checar histórico desses problemas na área.` });

    if (a.fixaNitrogenio && !p.fixaNitrogenio && p.familia === "gramínea")
      sinais.push({ tipo: "favoravel", texto: `${p.nome} aproveita o nitrogênio deixado pela leguminosa anterior (${a.nome}).` });
    if (p.fixaNitrogenio && !a.fixaNitrogenio)
      sinais.push({ tipo: "favoravel", texto: `${p.nome} fixa nitrogênio do ar, repondo parte do que ${a.nome} extraiu.` });
    if (a.familia === "solanácea" && p.familia === "solanácea")
      sinais.push({ tipo: "atencao", texto: "Solanáceas em sequência elevam muito o risco de murcha bacteriana e nematoides." });
    if (p.beneficios.some((b) => /palhada|cobertura/.test(b)))
      sinais.push({ tipo: "favoravel", texto: `${p.nome} deixa palhada/cobertura, que protege o solo contra erosão e aumenta a matéria orgânica.` });
  }

  if (p) {
    const ultimas = hist.slice(-3).map((h) => h.c).filter(Boolean) as Cultura[];
    const mesmas = ultimas.filter((c) => c.familia === p.familia).length;
    if (mesmas >= 2)
      sinais.push({ tipo: "atencao", texto: `${mesmas} das últimas ${ultimas.length} culturas já foram ${p.familia}s; mais uma reforça o acúmulo de problemas da família.` });
  }

  return { proposta: p?.nome ?? proposta, anterior: anterior?.c?.nome ?? anterior?.nome ?? null, sinais, lacunas };
}

export function avaliarRotacao(historico: string[], proposta: string) {
  const r = avaliarSucessao(historico, proposta);
  return resultado("avaliar_rotacao", {
    resumo: r.sinais.map((s) => `${s.tipo === "favoravel" ? "A favor" : "Atenção"}: ${s.texto}`),
    dados: r,
    fontes: [{ nome: "Fichas de referência agronômica do projeto (a validar por agrônomo)", tipo: "referencia_agronomica" }],
    limitacoes: [
      "Regras gerais de rotação; não consideram o histórico de doenças da área nem a cultivar. Validar com agrônomo.",
      ...r.lacunas,
    ],
  });
}
