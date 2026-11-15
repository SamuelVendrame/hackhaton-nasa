import { arred, media } from "../core/calc";
import { resultado, type Local } from "../core/tipos";
import { buscarElevacoes, FONTE_ELEVACAO } from "../fontes/elevacao";

/**
 * Declividade e posição no relevo a partir de um DEM de 90 m.
 * - Declividade: diferenças finitas numa grade 3x3 com passo de ~90 m.
 * - Posição: altitude do ponto contra a média de um anel de ~1 km (baixada, encosta, topo).
 */
export function calcularRelevo(grade: number[], anel: number[], passoM: number) {
  // grade em ordem: [NO, N, NE, O, C, L, SO, S, SE]
  const [a, b, c, d, e, f, g, h, i] = grade as [number, number, number, number, number, number, number, number, number];
  const dzdx = (c + 2 * f + i - (a + 2 * d + g)) / (8 * passoM);
  const dzdy = (g + 2 * h + i - (a + 2 * b + c)) / (8 * passoM);
  const declividadePct = Math.sqrt(dzdx * dzdx + dzdy * dzdy) * 100;
  const mediaAnel = media(anel)!;
  const diferenca = e - mediaAnel;
  const posicao = diferenca < -10 ? "baixada" : diferenca > 10 ? "topo/espigão" : "encosta/meia-encosta";
  // Classes de declividade (Embrapa): 0–3 plano, 3–8 suave ondulado, 8–20 ondulado, 20–45 forte ondulado, >45 montanhoso.
  const classe =
    declividadePct < 3 ? "plano" : declividadePct < 8 ? "suave ondulado" : declividadePct < 20 ? "ondulado" : declividadePct < 45 ? "forte ondulado" : "montanhoso";
  return { altitudeM: e, declividadePct: arred(declividadePct), classeDeclividade: classe, diferencaVizinhancaM: arred(diferenca, 0), posicao };
}

export async function relevo(local: Local) {
  const passo = 90;
  const dLat = passo / 111_320;
  const dLon = passo / (111_320 * Math.cos((local.lat * Math.PI) / 180));
  const grade: { lat: number; lon: number }[] = [];
  for (const dy of [1, 0, -1]) for (const dx of [-1, 0, 1]) grade.push({ lat: local.lat + dy * dLat, lon: local.lon + dx * dLon });
  const raio = 1000;
  const anel = Array.from({ length: 12 }, (_, k) => {
    const ang = (k / 12) * 2 * Math.PI;
    return { lat: local.lat + Math.sin(ang) * (raio / 111_320), lon: local.lon + Math.cos(ang) * (raio / (111_320 * Math.cos((local.lat * Math.PI) / 180))) };
  });
  const elev = await buscarElevacoes([...grade, ...anel]);
  const r = calcularRelevo(elev.slice(0, 9), elev.slice(9), passo);
  const resumo = [`Altitude ${r.altitudeM} m, declividade de ${r.declividadePct}% (${r.classeDeclividade}), posição: ${r.posicao} (${r.diferencaVizinhancaM! >= 0 ? "+" : ""}${r.diferencaVizinhancaM} m em relação ao entorno de 1 km).`];
  if (r.posicao === "baixada") resumo.push("Baixadas acumulam ar frio em noites calmas: o risco de geada é maior que o indicado pelos dados regionais.");
  if ((r.declividadePct ?? 0) >= 8) resumo.push("Declividade favorece erosão: culturas com palhada e plantio em nível reduzem a perda de solo.");
  return resultado("relevo", {
    local,
    resumo,
    dados: r,
    fontes: [FONTE_ELEVACAO],
    limitacoes: [
      "Modelo de elevação de 90 m: suaviza terraços e pequenas depressões dentro do talhão.",
      ...(local.precisao !== "talhao" ? ["Coordenada do CEP/município: o relevo calculado é o da cidade, não o do talhão."] : []),
    ],
  });
}
