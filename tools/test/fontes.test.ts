import { describe, expect, test } from "bun:test";
import * as XLSX from "xlsx";
import { cepParaLocal } from "../src/fontes/brasilapi";
import { parseMensal, parseSemanal } from "../src/fontes/deral";
import { centroideGeoJson, parsePam } from "../src/fontes/ibge";
import { estacoesProximas, parseEstacoes } from "../src/fontes/inmet";
import { parsePowerDiario } from "../src/fontes/nasa-power";
import { parsePrevisao, parseSazonal } from "../src/fontes/open-meteo";
import { parseSoilGrids } from "../src/fontes/soilgrids";
import { parseLinhaZarc, safraDaData } from "../src/fontes/zarc";
import { avaliarJanelaZarc, faixasIndicadas } from "../src/mapeamentos/janela-plantio";
import { classeTextural, rankearCulturas, resumirSolo, tendenciaMensal } from "../src/mapeamentos/regiao";

const fx = (n: string) => Bun.file(`${import.meta.dir}/fixtures/${n}`);

describe("BrasilAPI CEP v2", () => {
  test("extrai coordenada e IBGE de Cianorte", async () => {
    const l = cepParaLocal(await fx("cep-87209000.json").json());
    expect(l.ibge).toBe("4105508");
    expect(l.municipio).toBe("Cianorte");
    expect(l.lat).toBeCloseTo(-23.663, 2);
    expect(l.temCoordenada).toBe(true);
  });
  test("CEP sem coordenada não inventa ponto", () => {
    const l = cepParaLocal({ cep: "1", state: "PR", city: "X", service: "s", location: { type: "Point", coordinates: {} } });
    expect(l.temCoordenada).toBe(false);
    expect(l.lat).toBeUndefined();
  });
});

describe("NASA POWER", () => {
  test("converte para série por parâmetro e troca fill_value por null", async () => {
    const json = await fx("power-diario.json").json();
    json.properties.parameter.T2M_MIN["20251002"] = -999;
    const { serie, unidades } = parsePowerDiario(json);
    expect(serie.T2M_MAX!["20251001"]).toBe(32.61);
    expect(serie.T2M_MIN!["20251002"]).toBeNull();
    expect(unidades.PRECTOTCORR).toBe("mm/day");
  });
});

describe("Open-Meteo", () => {
  test("previsão diária", async () => {
    const dias = parsePrevisao(await fx("open-meteo-previsao.json").json());
    expect(dias.length).toBe(16);
    expect(dias[0]!.origem).toBe("previsao");
    expect(typeof dias[0]!.tmax).toBe("number");
  });
  test("sazonal resume membros em média e percentis", async () => {
    const dias = parseSazonal(await fx("open-meteo-sazonal.json").json());
    expect(dias.length).toBe(20);
    const d = dias[0]!;
    expect(d.membros!.chuva.length).toBe(6); // base + 5 membros no fixture
    expect(d.chuvaP10!).toBeLessThanOrEqual(d.chuva!);
    expect(d.chuvaP90!).toBeGreaterThanOrEqual(d.chuva!);
  });
});

describe("IBGE SIDRA (PAM)", () => {
  test("rankeia culturas de Cianorte pela área colhida", async () => {
    const linhas = parsePam(await fx("sidra-pam-cianorte.json").json());
    expect(linhas.some((l) => l.produto === "Abacaxi")).toBe(true); // asterisco removido
    const r = rankearCulturas(linhas);
    expect(r.culturas[0]!.produto).toBe("Cana-de-açúcar");
    expect(r.culturas.map((c) => c.produto).slice(0, 4)).toEqual(["Cana-de-açúcar", "Soja (em grão)", "Milho (em grão)", "Mandioca"]);
    expect(r.culturas.every((c) => !/Arábica/.test(c.produto))).toBe(true);
  });
  test("centroide de polígono", () => {
    const c = centroideGeoJson({ type: "Feature", geometry: { type: "Polygon", coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2]]] } });
    expect(c).toEqual({ lat: 1, lon: 1 });
  });
});

describe("ZARC", () => {
  async function linhas() {
    const [cab, ...rows] = (await fx("zarc-cianorte-amostra.csv").text()).replace(/^﻿/, "").trim().split(/\r?\n/);
    const idx = Object.fromEntries(cab!.split(";").map((c, i) => [c.trim(), i]));
    return rows.map((r) => parseLinhaZarc(r.split(";"), idx));
  }
  test("interpreta códigos de solo/ciclo/manejo", async () => {
    const ls = await linhas();
    const soja = ls.find((l) => l.cultura === "Soja")!;
    expect(soja.manejo).toBe("Sequeiro");
    expect(soja.solo).toMatch(/^AD\d$/);
    expect(soja.ciclo).toMatch(/^Grupo/);
    expect(soja.risco.length).toBe(36);
  });
  test("soja em Cianorte: indicada em dezembro, não indicada em março", async () => {
    const soja = (await linhas()).filter((l) => l.cultura === "Soja");
    const dez = avaliarJanelaZarc(soja, "2026-12-15");
    expect(dez.indicadoNaData).toBe(true);
    expect(dez.menorRiscoNaData).toBe(20);
    const mar = avaliarJanelaZarc(soja, "2027-03-15");
    expect(mar.indicadoNaData).toBe(false);
    expect(mar.proximosDecendiosIndicados[0]!.periodo).toBe("1 a 10/set");
  });
  test("janela que atravessa o ano vira uma faixa só", () => {
    const riscos = Array(36).fill(0);
    for (const i of [0, 1, 2, 3, 4, 5, 6, 7, 35]) riscos[i] = 20; // 21/dez a 20/mar
    expect(faixasIndicadas(riscos)).toEqual([{ de: "21 ao fim de dez", ate: "11 a 20/mar", menorRisco: 20 }]);
    expect(faixasIndicadas(Array(36).fill(20))).toEqual([{ de: "1 a 10/jan", ate: "21 ao fim de dez", menorRisco: 20 }]);
  });
  test("safra agrícola vai de julho a junho", () => {
    expect(safraDaData("2026-11-15")).toBe("2026/2027");
    expect(safraDaData("2027-03-01")).toBe("2026/2027");
    expect(safraDaData("2027-07-01")).toBe("2027/2028");
  });
});

describe("SoilGrids", () => {
  const json = {
    properties: {
      layers: [
        { name: "clay", unit_measure: { d_factor: 10, target_units: "%" }, depths: [{ label: "0-5cm", values: { mean: 120, "Q0.05": 50, "Q0.95": 200 } }] },
        { name: "sand", unit_measure: { d_factor: 10, target_units: "%" }, depths: [{ label: "0-5cm", values: { mean: 780 } }] },
        { name: "phh2o", unit_measure: { d_factor: 10, target_units: "-" }, depths: [{ label: "0-5cm", values: { mean: 55 } }] },
      ],
    },
  };
  test("aplica d_factor e classifica textura", () => {
    const camadas = parseSoilGrids(json);
    expect(camadas[0]).toMatchObject({ propriedade: "clay", media: 12, q05: 5, q95: 20 });
    const r = resumirSolo(camadas);
    expect(r.ph).toBe(5.5);
    expect(r.classeTextural).toBe("arenosa");
  });
  test("classes texturais", () => {
    expect(classeTextural(65, 10)).toBe("muito argilosa");
    expect(classeTextural(40, 30)).toBe("argilosa");
    expect(classeTextural(25, 50)).toBe("média");
    expect(classeTextural(null, null)).toBeNull();
  });
});

describe("DERAL", () => {
  function xls(linhas: unknown[][]) {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhas), "Rav");
    return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "biff8" }));
  }
  test("planilha semanal por regional", () => {
    const b = xls([
      ["PREÇOS MÉDIOS SEMANAIS RECEBIDOS PELOS AGRICULTORES", null, null, "SEMANA: 46-2026", "PERÍODO: 09/11/2026 a 13/11/2026"],
      ["Produto", null, "Unid.", "Maringá", "Umuarama", "MÉDIA", "MSA", "%MSA"],
      ["CULTURAS DE VERAO"],
      [null, "Soja", "60 kg", 138, 135.09, 136.6, 133.28, 2.49],
    ]);
    const r = parseSemanal(b);
    expect(r.semana).toBe("46-2026");
    expect(r.periodo).toBe("09/11/2026 a 13/11/2026");
    expect(r.precos[0]).toMatchObject({ grupo: "CULTURAS DE VERAO", produto: "Soja", mediaEstado: 136.6, porRegional: { Maringá: 138, Umuarama: 135.09 } });
  });
  test("planilha mensal e tendência", () => {
    const meses = ["OUT/26", "SET/26", "AGO/26", "JUL/26", "JUN/26", "MAI/26", "ABR/26", "MAR/26", "FEV/26", "JAN/26", "DEZ/25", "NOV/25", "OUT/25"];
    const b = xls([
      ["PREÇOS MÉDIOS NOMINAIS MENSAIS"],
      ["Produto", null, "Unid.", ...meses, "Ano/26", "Ano/25"],
      ["CULTURAS DE VERAO"],
      [null, "Soja", "60 kg", 135.5, 137.8, 127.3, 119, 112.5, 111.8, 112.1, 115.1, 113.1, 115.2, 120.4, 121.9, 119.3, 119.9, 118.9],
      [null, "Arroz sequeiro", "60 kg", "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", 119.19, "-", "-", "-", 138.2],
    ]);
    const r = parseMensal(b);
    expect(r.precos[0]!.meses[0]).toEqual({ mes: "OUT/26", valor: 135.5 });
    const t = tendenciaMensal(r.precos[0]!);
    expect(t.direcao).toBe("alta");
    expect(t.vsMesmoMesAnoAnteriorPct).toBeCloseTo(13.6, 0);
    // Produto sem cotação recente não quebra a tendência.
    expect(tendenciaMensal(r.precos[1]!).ultimoMes).toBe("DEZ/25");
  });
});

describe("INMET", () => {
  test("estação operante mais próxima de Cianorte é Cidade Gaúcha", async () => {
    const est = parseEstacoes(await fx("inmet-estacoes.json").json());
    const p = estacoesProximas(est, -23.66333, -52.605, 2);
    expect(p[0]!.codigo).toBe("A869");
    expect(p[0]!.distanciaKm).toBeGreaterThan(40);
  });
});

describe("município pela coordenada", () => {
  test("ponto dentro de polígono com buraco", async () => {
    const { pontoNoPoligono, feicaoQueContem } = await import("../src/fontes/ibge");
    const externo: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
    const buraco: [number, number][] = [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]];
    expect(pontoNoPoligono(2, 2, [externo, buraco])).toBe(true);
    expect(pontoNoPoligono(5, 5, [externo, buraco])).toBe(false);
    expect(pontoNoPoligono(11, 5, [externo])).toBe(false);
    const geo = { features: [{ properties: { codarea: "123" }, geometry: { type: "MultiPolygon", coordinates: [[externo]] } }] };
    expect(feicaoQueContem(geo, 3, 3)).toBe("123");
    expect(feicaoQueContem(geo, 20, 20)).toBeNull();
  });
});
