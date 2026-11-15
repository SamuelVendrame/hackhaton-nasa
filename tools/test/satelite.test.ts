import { describe, expect, test } from "bun:test";
import { estadoToken, indiceImerg, parseImergAscii } from "../src/fontes/earthdata";
import { datasModis, parseModis } from "../src/fontes/modis";
import { analisarNdvi, classeNdvi, compararChuvaSatelite, resumirSmap } from "../src/mapeamentos/satelite";

describe("MODIS", () => {
  test("interpreta a resposta do ORNL (escala 0,0001 e confiabilidade)", async () => {
    const c = parseModis(await Bun.file(`${import.meta.dir}/fixtures/modis-mod13q1.json`).json());
    expect(c.map((x) => x.data)).toEqual(["2026-09-14", "2026-09-30", "2026-10-16"]);
    expect(c[2]!.ndvi).toBeCloseTo(0.4889, 4);
    expect(c[2]!.evi).toBeCloseTo(0.3433, 4);
    expect(c[0]!.confiabilidade).toBe(0);
  });

  test("datas de composição a cada 16 dias, reiniciando no ano novo", () => {
    const d = datasModis("2025-12-01", "2026-01-20");
    expect(d.map((x) => x.codigo)).toEqual(["A2025337", "A2025353", "A2026001", "A2026017"]);
    expect(d[2]!.data).toBe("2026-01-01");
  });

  test("análise: tendência, anomalia e solo exposto", () => {
    const serie = [
      { data: "2026-08-01", ndvi: 0.2, evi: 0.1, confiabilidade: 0 },
      { data: "2026-08-17", ndvi: 0.22, evi: 0.1, confiabilidade: 0 },
      { data: "2026-09-02", ndvi: 0.9, evi: 0.5, confiabilidade: 3 }, // nuvem: ignorada
      { data: "2026-09-18", ndvi: 0.4, evi: 0.2, confiabilidade: 0 },
      { data: "2026-10-04", ndvi: 0.6, evi: 0.3, confiabilidade: 1 },
    ];
    const hist = [0.5, 0.7, 0.6].map((ndvi, i) => ({ data: `202${i}-10-04`, ndvi, evi: null, confiabilidade: 0 }));
    const a = analisarNdvi(serie, hist);
    expect(a.atual!.ndvi).toBe(0.6);
    expect(a.tendencia).toBe("subindo");
    expect(a.normalMesmaEpoca).toBe(0.6);
    expect(a.anomalia).toBe(0);
    expect(a.composicoesComNuvem).toBe(1);
    expect(a.solo.composicoesExpostas12m).toBe(2);
    expect(a.solo.maiorPeriodoExpostoDias).toBe(32);
  });

  test("classes de NDVI", () => {
    expect(classeNdvi(0.1)).toBe("solo exposto ou palhada");
    expect(classeNdvi(0.8)).toBe("vegetação densa");
    expect(classeNdvi(null)).toBe("sem dado");
  });
});

describe("IMERG", () => {
  test("índices da grade de 0,1°", () => {
    expect(indiceImerg(-23.7, -52.56)).toEqual({ ilon: 1274, ilat: 663 });
  });

  test("lê a resposta ASCII do OPeNDAP", () => {
    const t = "Dataset: x.nc4\nprecipitation.lat, -23.65\nprecipitation.precipitation[precipitation.time=16704][precipitation.lon=-52.55], 3.83\n";
    expect(parseImergAscii(t)).toBe(3.83);
    expect(parseImergAscii("<html>erro</html>")).toBeNull();
  });

  test("compara com a normal e com o POWER nos dias em comum", () => {
    const dias = [
      { data: "2026-11-01", chuva: 0 },
      { data: "2026-11-02", chuva: 60 },
      { data: "2026-11-03", chuva: null },
      { data: "2026-11-04", chuva: 10 },
    ];
    const c = compararChuvaSatelite(dias, () => 5, (d) => (d === "2026-11-02" ? 40 : null));
    expect(c.totalMm).toBe(70);
    expect(c.normalMm).toBe(15);
    expect(c.diasChuvaForte).toBe(1);
    expect(c.maiorChuva).toEqual({ data: "2026-11-02", mm: 60 });
    expect(c.conferenciaPower).toEqual({ dias: 1, imergMm: 60, powerMm: 40 });
  });
});

describe("SMAP", () => {
  test("usa a média da área quando o pixel do ponto vem vazio e compara com anos anteriores", () => {
    const dias = [
      { data: "2026-11-01", umidade: 0.3, umidadeArea: 0.3 },
      { data: "2026-11-02", umidade: null, umidadeArea: null },
      { data: "2026-11-03", umidade: null, umidadeArea: 0.2 },
      { data: "2026-11-04", umidade: 0.1, umidadeArea: 0.12 },
    ];
    const r = resumirSmap(dias, [{ ano: 2025, dias: [{ data: "2025-11-01", umidade: 0.25, umidadeArea: 0.25 }] }]);
    expect(r.ultimo).toEqual({ data: "2026-11-04", umidade: 0.1, noPonto: true });
    expect(r.diasComPassagem).toBe(3);
    expect(r.mediaJanela).toBe(0.2);
    expect(r.tendencia).toBe("secando");
    expect(r.variacaoSobreAnosAnterioresPct).toBe(-20);
  });
});

describe("token Earthdata", () => {
  const jwt = (carga: object) => `x.${Buffer.from(JSON.stringify(carga)).toString("base64url")}.y`;
  test("lê usuário e validade", () => {
    const exp = Math.floor(Date.now() / 1000) + 20 * 86400;
    const t = estadoToken(jwt({ uid: "fulano", exp }));
    expect(t.ok).toBe(true);
    expect(t.usuario).toBe("fulano");
    expect(t.diasRestantes).toBe(19);
  });
  test("expirado ou ausente", () => {
    expect(estadoToken(jwt({ uid: "a", exp: 1 })).ok).toBe(false);
    expect(estadoToken("").ok).toBe(false);
  });
});
