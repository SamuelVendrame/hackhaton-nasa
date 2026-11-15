import { describe, expect, test } from "bun:test";
import { extrairJson } from "../src/agentes/motor";
import { prepararParaFala } from "../src/audio/tts";
import { Analise, esquemaJson, PerfilCliente, Resposta } from "../src/contratos";
import { clienteDoArquivo } from "../src/observador";
import {
  extrairNumeros,
  frasesImpositivas,
  normalizarFala,
  numerosSemLastro,
  porExtenso,
  problemasDaAnalise,
  problemasDeTexto,
  similaridade,
} from "../src/verificacao";

const perfil = PerfilCliente.parse({ id: "x", nome: "João", comoChamar: "Seu João", local: { cep: "87209000" } });

describe("números por extenso e normalização", () => {
  test("por extenso", () => {
    expect(porExtenso(17)).toBe("dezessete");
    expect(porExtenso(27)).toBe("vinte e sete");
    expect(porExtenso(100)).toBe("cem");
    expect(porExtenso(137)).toBe("cento e trinta e sete");
    expect(porExtenso(1073)).toBe("mil e setenta e tres".replace("tres", "três"));
    expect(porExtenso(2026)).toBe("dois mil e vinte e seis");
  });
  test("normaliza acento, pontuação e números", () => {
    expect(normalizarFala("Faz sentido, Seu João! 27 milímetros.")).toEqual(["faz", "sentido", "seu", "joao", "vinte", "e", "sete", "milimetros"]);
  });
  test("similaridade tolera número escrito de outro jeito", () => {
    expect(similaridade("A chuva foi de 27 milímetros.", "a chuva foi de vinte e sete milímetros")).toBe(1);
    expect(similaridade("plantar soja em dezembro", "plantar só já em dezembro")).toBeCloseTo(0.5, 1);
  });
});

describe("lastro dos números", () => {
  test("extrai decimais com vírgula, milhar e datas ISO", () => {
    expect(extrairNumeros("subiu 16,7% e choveu 1.073 mm em 2026-12-15")).toEqual([2026, 12, 15, 16.7, 1073]);
  });
  test("aceita arredondamento de fala e rejeita número inventado", () => {
    const base = [16.7, 136.6, 20, 1073];
    expect(numerosSemLastro([17, 137, 20], base)).toEqual([]);
    expect(numerosSemLastro([45], base)).toEqual([45]);
    expect(numerosSemLastro([2], base)).toEqual([]);
  });
});

describe("tom", () => {
  test("detecta frases que mandam", () => {
    expect(frasesImpositivas("Eu consideraria a soja. Você deve plantar agora. Plante milho.")).toEqual(["Você deve plantar agora.", "Plante milho."]);
    expect(frasesImpositivas("O receituário agronômico é obrigatório para defensivos.")).toEqual([]);
  });
  test("problemas de texto para voz", () => {
    const r: Resposta = { textoFalado: "Seu João, o ZARC indica 20% de risco.", textoTela: ["a", "b"], numerosCitados: ["20"], tomAplicado: "" };
    const p = problemasDeTexto(r, perfil).problemas.join(" ");
    expect(p).toMatch(/símbolos/);
    expect(p).toMatch(/Termo técnico/);
  });
  test("prepara texto para o sintetizador", () => {
    expect(prepararParaFala("Subiu 17% e a saca está R$ 137 (DERAL); mínima de 3°C e 27mm.")).toBe(
      "Subiu 17 por cento e a saca está 137 reais, DERAL; mínima de 3 graus e 27 milímetros.",
    );
  });
});

describe("fluxo da análise", () => {
  const base: Analise = {
    intencao: "decisao_plantio",
    perguntaEntendida: "",
    ferramentasUsadas: [],
    achados: [],
    estrategias: [],
    sugestaoPrincipal: "",
    riscos: [],
    lacunas: [],
    procurarAgronomo: "",
    perguntaDeRetorno: "",
    fatosNovosDoCliente: [],
  };
  test("decisão sem ferramentas e sem 3 estratégias é sinalizada", () => {
    const p = problemasDaAnalise(base, []);
    expect(p.length).toBe(4);
  });
  test("saudação não exige ferramentas", () => {
    expect(problemasDaAnalise({ ...base, intencao: "saudacao" }, [])).toEqual([]);
  });
});

describe("contratos e utilitários", () => {
  test("esquema JSON gerado para o --json-schema", () => {
    const s = esquemaJson(Analise) as any;
    expect(s.type).toBe("object");
    expect(s.required).toContain("estrategias");
  });
  test("extrai JSON de resposta com cerca de código", () => {
    expect(extrairJson('aqui está:\n```json\n{"a": 1}\n```')).toEqual({ a: 1 });
  });
  test("cliente pelo nome do arquivo", () => {
    expect(clienteDoArquivo("joao-cianorte__2026-11-15.ogg")).toBe("joao-cianorte");
    expect(clienteDoArquivo("audio.ogg")).toBe("desconhecido");
  });
  test("perfil mínimo recebe padrões de comunicação", () => {
    expect(perfil.comunicacao.tamanhoResposta).toBe("curta");
    expect(perfil.propriedade.historicoPlantios).toEqual([]);
  });
});

describe("boletim proativo", () => {
  test("monta análise determinística a partir do resumo_periodico", async () => {
    const { analiseDoBoletim } = await import("../src/boletim");
    const resumo = { resumo: ["Próximos 7 dias: 27 mm de chuva (dentro do normal)."], dados: { destaques: ["chuva forte em 2026-11-20"] }, fontes: [{ nome: "Open-Meteo" }], limitacoes: ["x"] };
    const a = Analise.parse(analiseDoBoletim("semanal", resumo, null));
    expect(a.intencao).toBe("monitoramento");
    expect(a.achados[0]!.ferramenta).toBe("resumo_periodico");
    expect(a.riscos).toEqual(["chuva forte em 2026-11-20"]);
  });
});

describe("tom: falsos positivos", () => {
  test("substantivo não é ordem", () => {
    expect(frasesImpositivas("A aveia não tem venda clara aqui. Faça a análise de solo.")).toEqual(["Faça a análise de solo."]);
  });
});

import { estrategiasOmitidas } from "../src/verificacao";
test("estratégias omitidas na fala", () => {
  const est = (nome: string) => ({ nome } as any);
  const a = { estrategias: [est("Soja em meados de dezembro (o que você pensou)"), est("Milho 1ª safra em meados de dezembro"), est("Feijão em meados de dezembro"), est("Esperar 30 dias e plantar trigo")] } as any;
  const r = { textoFalado: "A soja em dezembro é boa opção; o feijão tem risco." } as any;
  expect(estrategiasOmitidas(r, a)).toEqual(["Milho 1ª safra em meados de dezembro", "Esperar 30 dias e plantar trigo"]);
});
