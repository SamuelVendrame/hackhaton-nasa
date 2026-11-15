import { describe, expect, test } from "bun:test";
import { decendio, descreverDecendio, diasEntre, listarDias, maiorSequencia, media, percentil, somarDias, variacaoPct } from "../src/core/calc";

describe("datas", () => {
  test("decêndio do ZARC", () => {
    expect(decendio("2026-01-01")).toBe(1);
    expect(decendio("2026-01-10")).toBe(1);
    expect(decendio("2026-01-11")).toBe(2);
    expect(decendio("2026-01-31")).toBe(3);
    expect(decendio("2026-12-15")).toBe(35);
    expect(decendio("2026-12-31")).toBe(36);
    expect(descreverDecendio(35)).toBe("11 a 20/dez");
  });

  test("soma de dias atravessa ano e bissexto", () => {
    expect(somarDias("2026-12-30", 3)).toBe("2027-01-02");
    expect(somarDias("2028-02-28", 1)).toBe("2028-02-29");
    expect(diasEntre("2026-01-01", "2026-12-31")).toBe(364);
    expect(listarDias("2026-01-30", "2026-02-02")).toEqual(["2026-01-30", "2026-01-31", "2026-02-01", "2026-02-02"]);
  });
});

describe("estatística", () => {
  test("ignora nulos", () => {
    expect(media([1, null, 3, undefined])).toBe(2);
    expect(media([null])).toBeNull();
  });
  test("percentil com interpolação", () => {
    expect(percentil([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(percentil([0, 10], 0.1)).toBeCloseTo(1);
  });
  test("maior sequência", () => {
    expect(maiorSequencia([0, 0, 5, 0, 0, 0, 2], (x) => x < 1)).toBe(3);
  });
  test("variação percentual", () => {
    expect(variacaoPct(110, 100)).toBeCloseTo(10);
    expect(variacaoPct(1, 0)).toBeNull();
  });
});
