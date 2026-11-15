import { describe, expect, test } from "bun:test";
import { listarDias } from "../src/core/calc";
import type { DiaClima } from "../src/core/tipos";
import { climatologiaDiaria, janelaPorAno, type Historico } from "../src/mapeamentos/base-clima";
import { calcularCalor, calcularChuva, calcularGeada } from "../src/mapeamentos/clima";
import { compararFotos, type Foto } from "../src/mapeamentos/monitoramento";
import { calcularRelevo } from "../src/mapeamentos/relevo";
import { avaliarSucessao, problemasCompartilhados } from "../src/mapeamentos/rotacao";
import { acharCultura } from "../src/conhecimento/culturas";

/** Histórico sintético: 3 anos; geada só em julho de 2021; 5 mm/dia sempre. */
function historico(): Historico {
  const dias: Historico["dias"] = new Map();
  for (const d of listarDias("2020-01-01", "2022-12-31")) {
    const julho2021 = d.startsWith("2021-07-1");
    dias.set(d, { tmin: julho2021 ? 1 : 12, tmax: d.slice(5, 7) === "01" ? 36 : 28, chuva: 5, vento: 10, umidSoloRaiz: 0.5, umidSoloSup: 0.5 });
  }
  return { inicio: "2020-01-01", fim: "2022-12-31", dias };
}

const dia = (data: string, p: Partial<DiaClima>): DiaClima => ({ data, tmin: 15, tmax: 28, chuva: 0, origem: "previsao", ...p });

describe("base de clima", () => {
  test("recorta a mesma janela em cada ano, inclusive virando o ano", () => {
    const h = historico();
    expect(janelaPorAno(h, { inicio: "2026-07-01", fim: "2026-07-31" }).map((a) => a.ano)).toEqual([2020, 2021, 2022]);
    const virada = janelaPorAno(h, { inicio: "2026-12-20", fim: "2027-01-10" });
    expect(virada.map((a) => a.ano)).toEqual([2020, 2021]); // 2022-12-20 → 2023-01-10 sai do histórico
    expect(virada[0]!.dias.length).toBe(22);
  });
  test("climatologia diária suavizada", () => {
    const n = climatologiaDiaria(historico());
    expect(n.get("03-15")!.chuva).toBeCloseTo(5);
    expect(n.get("03-15")!.tmin).toBeCloseTo(12);
  });
});

describe("geada", () => {
  test("frequência histórica e dias previstos", () => {
    const h = historico();
    const anos = janelaPorAno(h, { inicio: "2026-07-01", fim: "2026-07-31" });
    const g = calcularGeada([dia("2026-07-05", { tmin: 2 }), dia("2026-07-06", { tmin: 8 })], anos);
    expect(g.historico.anosComRiscoGeada).toBe(1);
    expect(g.historico.frequencia).toBeCloseTo(0.33, 2);
    expect(g.diasPrevistosComRisco.map((d) => d.data)).toEqual(["2026-07-05"]);
  });
  test("probabilidade sazonal pela fração de membros", () => {
    const saz: DiaClima[] = [
      { data: "2026-07-01", tmin: 8, tmax: 20, chuva: 0, origem: "previsao_sazonal", membros: { tmin: [2, 8, 9, 10], tmax: [], chuva: [] } },
      { data: "2026-07-02", tmin: 8, tmax: 20, chuva: 0, origem: "previsao_sazonal", membros: { tmin: [9, 3, 9, 10], tmax: [], chuva: [] } },
    ];
    expect(calcularGeada(saz, []).probabilidadeSazonal).toBe(0.5);
  });
});

describe("calor", () => {
  test("conta dias acima do limiar e a maior sequência", () => {
    const dias = [dia("2027-01-01", { tmax: 36 }), dia("2027-01-02", { tmax: 37 }), dia("2027-01-03", { tmax: 30 }), dia("2027-01-04", { tmax: 35 })];
    const c = calcularCalor(dias, janelaPorAno(historico(), { inicio: "2027-01-01", fim: "2027-01-10" }), 35);
    expect(c.diasPrevistosAcimaLimiar.length).toBe(3);
    expect(c.maiorSequenciaPrevista).toBe(2);
    expect(c.historico.mediaDiasPorAno).toBe(10); // janeiro sintético tem máxima 36
  });
});

describe("chuva", () => {
  test("classifica pelo tercil histórico e mede sequência seca", () => {
    const h = historico();
    const anos = janelaPorAno(h, { inicio: "2026-03-01", fim: "2026-03-10" });
    const secos = listarDias("2026-03-01", "2026-03-10").map((d) => dia(d, { chuva: d === "2026-03-05" ? 60 : 0 }));
    const c = calcularChuva(secos, anos, 50);
    expect(c.totalMm).toBe(60);
    expect(c.anomaliaPct).toBe(20);
    expect(c.maiorSequenciaSecaPrevista).toBe(5);
    expect(c.diasChuvaForte).toEqual([{ data: "2026-03-05", mm: 60 }]);
    expect(c.classificacao).toBe("acima do normal");
  });
  test("janela dominada pela sazonal vira tendência e ganha probabilidades por tercil", () => {
    const anos = [10, 20, 30, 40, 50, 60].map((mm, i) => ({ ano: 2000 + i, dias: [{ tmin: 10, tmax: 20, chuva: mm }] }));
    const saz: DiaClima[] = [
      { data: "2026-04-01", tmin: 10, tmax: 20, chuva: 45, origem: "previsao_sazonal", membros: { tmin: [], tmax: [], chuva: [5, 35, 55, 65] } },
    ];
    const c = calcularChuva(saz, anos, 35);
    expect(c.classificacao).toStartWith("tendência");
    expect(c.probabilidadeTercis).toEqual({ abaixo: 0.25, normal: 0.25, acima: 0.5 });
  });
});

describe("rotação", () => {
  test("soja após batata: alterna família e fixa N, mas compartilha nematoide", () => {
    const r = avaliarSucessao(["batata"], "soja");
    expect(r.sinais.some((s) => s.tipo === "favoravel" && /alterna famílias/.test(s.texto))).toBe(true);
    expect(r.sinais.some((s) => s.tipo === "atencao" && /nematoide/.test(s.texto))).toBe(true);
  });
  test("feijão após soja: mesma família e mofo branco em comum", () => {
    const r = avaliarSucessao(["milho", "soja"], "feijao");
    expect(r.sinais.some((s) => /mesma família/.test(s.texto))).toBe(true);
    expect(problemasCompartilhados(acharCultura("soja")!, acharCultura("feijao")!)).toContain("sclerotinia");
  });
  test("monocultura", () => {
    expect(avaliarSucessao(["soja"], "soja").sinais.some((s) => /monocultura/.test(s.texto))).toBe(true);
  });
  test("cultura desconhecida vira lacuna, não erro", () => {
    expect(avaliarSucessao(["xyz"], "soja").lacunas.length).toBe(1);
  });
});

describe("relevo", () => {
  test("plano no topo", () => {
    const r = calcularRelevo([500, 500, 500, 500, 500, 500, 500, 500, 500], [480, 480, 480], 90);
    expect(r).toMatchObject({ declividadePct: 0, classeDeclividade: "plano", posicao: "topo/espigão" });
  });
  test("rampa de 9 m a cada 90 m = 10% (ondulado), em baixada", () => {
    // altitude cresce para leste: colunas O=491, C=500, L=509
    const r = calcularRelevo([491, 500, 509, 491, 500, 509, 491, 500, 509], [520, 530, 525], 90);
    expect(r.declividadePct).toBeCloseTo(10, 0);
    expect(r.classeDeclividade).toBe("ondulado");
    expect(r.posicao).toBe("baixada");
  });
});

describe("monitoramento", () => {
  const base: Foto = {
    plantioId: "p1",
    tiradaEm: "2026-11-01T00:00:00Z",
    periodo: { inicio: "2026-11-01", fim: "2027-03-01" },
    chuvaTotalMm: 600,
    chuvaClasse: "dentro do normal",
    diasGeadaPrevistos: [],
    probGeadaSazonal: 0.05,
    diasCalorPrevistos: [],
    diasChuvaForte: [],
    rajadasFortes: [],
    maiorSequenciaSeca: 3,
  };
  test("sem mudança, sem alerta", () => {
    expect(compararFotos(base, { ...base })).toEqual([]);
  });
  test("previsão virou de sol para chuva forte", () => {
    const agora = { ...base, chuvaClasse: "acima do normal", chuvaTotalMm: 820, diasChuvaForte: ["2026-11-20"] };
    const a = compararFotos(base, agora);
    expect(a.map((x) => x.tipo)).toEqual(["chuva", "chuva"]);
    expect(a[1]!.texto).toContain("dentro do normal");
  });
  test("nova geada é alerta máximo e não repete o que já foi avisado", () => {
    const comGeada = { ...base, diasGeadaPrevistos: ["2026-11-10"] };
    expect(compararFotos(base, comGeada)[0]).toMatchObject({ severidade: "alerta", tipo: "geada" });
    expect(compararFotos(comGeada, comGeada)).toEqual([]);
  });
});
