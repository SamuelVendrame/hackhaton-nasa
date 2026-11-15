/** Funções puras de datas e estatística usadas pelos mapeamentos. */

export const iso = (d: Date) => d.toISOString().slice(0, 10);
export const hoje = () => iso(new Date());

export function somarDias(dataIso: string, dias: number) {
  const d = new Date(dataIso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + dias);
  return iso(d);
}

export function diasEntre(a: string, b: string) {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86_400_000);
}

export function listarDias(inicio: string, fim: string) {
  const out: string[] = [];
  for (let d = inicio; d <= fim; d = somarDias(d, 1)) out.push(d);
  return out;
}

/** "MM-DD" de uma data, para comparar com a climatologia do mesmo dia. */
export const mesDia = (dataIso: string) => dataIso.slice(5, 10);

/** Decêndio do ZARC (1 a 36): 1 = 1º a 10 de janeiro, 2 = 11 a 20, 3 = 21 ao fim do mês. */
export function decendio(dataIso: string) {
  const mes = Number(dataIso.slice(5, 7));
  const dia = Number(dataIso.slice(8, 10));
  return (mes - 1) * 3 + (dia <= 10 ? 1 : dia <= 20 ? 2 : 3);
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export function descreverDecendio(n: number) {
  const mes = MESES[Math.floor((n - 1) / 3)];
  const parte = (n - 1) % 3;
  return parte === 0 ? `1 a 10/${mes}` : parte === 1 ? `11 a 20/${mes}` : `21 ao fim de ${mes}`;
}

const validos = (xs: (number | null | undefined)[]) => xs.filter((x): x is number => x != null && Number.isFinite(x));

export function soma(xs: (number | null | undefined)[]) {
  return validos(xs).reduce((a, b) => a + b, 0);
}

export function media(xs: (number | null | undefined)[]) {
  const v = validos(xs);
  return v.length ? soma(v) / v.length : null;
}

export function percentil(xs: (number | null | undefined)[], p: number) {
  const v = validos(xs).sort((a, b) => a - b);
  if (!v.length) return null;
  const pos = (v.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return v[lo]! + (v[hi]! - v[lo]!) * (pos - lo);
}

export function minimo(xs: (number | null | undefined)[]) {
  const v = validos(xs);
  return v.length ? Math.min(...v) : null;
}

export function maximo(xs: (number | null | undefined)[]) {
  const v = validos(xs);
  return v.length ? Math.max(...v) : null;
}

export function contar<T>(xs: T[], pred: (x: T) => boolean) {
  return xs.filter(pred).length;
}

/** Maior sequência de itens consecutivos que satisfazem o predicado. */
export function maiorSequencia<T>(xs: T[], pred: (x: T) => boolean) {
  let atual = 0;
  let maior = 0;
  for (const x of xs) {
    atual = pred(x) ? atual + 1 : 0;
    maior = Math.max(maior, atual);
  }
  return maior;
}

export const arred = (x: number | null | undefined, casas = 1) =>
  x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** casas) / 10 ** casas;

/** Distância aproximada em km (equiretangular; suficiente para escolher a estação mais próxima). */
export function distanciaKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const r = Math.PI / 180;
  const x = (lon2 - lon1) * Math.cos(((lat1 + lat2) / 2) * r);
  const y = lat2 - lat1;
  return Math.sqrt(x * x + y * y) * 111.32;
}

export function variacaoPct(atual: number | null, anterior: number | null) {
  if (atual == null || anterior == null || anterior === 0) return null;
  return ((atual - anterior) / Math.abs(anterior)) * 100;
}
