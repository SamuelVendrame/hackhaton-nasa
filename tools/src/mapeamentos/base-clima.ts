import { diasEntre, hoje, listarDias, media, mesDia, somarDias } from "../core/calc";
import type { DiaClima, Fonte, Local, Periodo } from "../core/tipos";
import { buscarHistoricoPower, buscarPowerDiario, expande, FONTE_POWER } from "../fontes/nasa-power";
import { buscarPrevisao, buscarSazonal, FONTE_PREVISAO, FONTE_SAZONAL } from "../fontes/open-meteo";

/**
 * Peças compartilhadas pelas ferramentas de clima. Todas leem as mesmas três chamadas
 * (histórico POWER de 20 anos, previsão 16 dias, previsão sazonal), que ficam em cache:
 * rodar geada, calor, chuva e vento juntos custa o mesmo que rodar um só.
 */

export interface Historico {
  inicio: string;
  fim: string;
  /** AAAA-MM-DD → valores do dia. */
  dias: Map<string, { tmin: number | null; tmax: number | null; chuva: number | null; vento: number | null; umidSoloRaiz: number | null; umidSoloSup: number | null }>;
}

export async function carregarHistorico(local: Local): Promise<Historico> {
  const { serie, inicio, fim } = await buscarHistoricoPower(local.lat, local.lon);
  const dias: Historico["dias"] = new Map();
  for (const d of Object.keys(serie.T2M_MIN ?? {})) {
    dias.set(expande(d), {
      tmin: serie.T2M_MIN?.[d] ?? null,
      tmax: serie.T2M_MAX?.[d] ?? null,
      chuva: serie.PRECTOTCORR?.[d] ?? null,
      vento: serie.WS2M?.[d] != null ? serie.WS2M[d]! * 3.6 : null,
      umidSoloRaiz: serie.GWETROOT?.[d] ?? null,
      umidSoloSup: serie.GWETTOP?.[d] ?? null,
    });
  }
  return { inicio, fim, dias };
}

export interface Normal {
  tmin: number | null;
  tmax: number | null;
  chuva: number | null;
  umidSoloRaiz: number | null;
}

/** Normal diária por MM-DD, suavizada numa janela de ±7 dias sobre os 20 anos. */
export function climatologiaDiaria(h: Historico, meiaJanela = 7): Map<string, Normal> {
  const porMd = new Map<string, { tmin: number[]; tmax: number[]; chuva: number[]; us: number[] }>();
  for (const [data, v] of h.dias) {
    const md = mesDia(data);
    const reg = porMd.get(md) ?? { tmin: [], tmax: [], chuva: [], us: [] };
    if (v.tmin != null) reg.tmin.push(v.tmin);
    if (v.tmax != null) reg.tmax.push(v.tmax);
    if (v.chuva != null) reg.chuva.push(v.chuva);
    if (v.umidSoloRaiz != null) reg.us.push(v.umidSoloRaiz);
    porMd.set(md, reg);
  }
  // Ano bissexto de referência para percorrer todos os MM-DD.
  const mds = listarDias("2024-01-01", "2024-12-31").map(mesDia);
  const out = new Map<string, Normal>();
  mds.forEach((md, i) => {
    const viz: { tmin: number[]; tmax: number[]; chuva: number[]; us: number[] }[] = [];
    for (let k = -meiaJanela; k <= meiaJanela; k++) {
      const r = porMd.get(mds[(i + k + mds.length) % mds.length]!);
      if (r) viz.push(r);
    }
    out.set(md, {
      tmin: media(viz.flatMap((r) => r.tmin)),
      tmax: media(viz.flatMap((r) => r.tmax)),
      chuva: media(viz.flatMap((r) => r.chuva)),
      umidSoloRaiz: media(viz.flatMap((r) => r.us)),
    });
  });
  return out;
}

/**
 * Recorta a mesma janela de calendário em cada ano do histórico (trata virada de ano).
 * Serve para frequências: "em quantos dos últimos 20 anos houve geada nesta janela?".
 */
export function janelaPorAno(h: Historico, periodo: Periodo) {
  const dur = diasEntre(periodo.inicio, periodo.fim);
  const anoIni = Number(h.inicio.slice(0, 4));
  const anoFim = Number(h.fim.slice(0, 4));
  const mdIni = periodo.inicio.slice(4);
  const anos: { ano: number; dias: NonNullable<ReturnType<Historico["dias"]["get"]>>[] }[] = [];
  for (let a = anoIni; a <= anoFim; a++) {
    const ini = `${a}${mdIni === "-02-29" ? "-02-28" : mdIni}`;
    const fim = somarDias(ini, dur);
    if (fim > h.fim) break;
    const dias = listarDias(ini, fim)
      .map((d) => h.dias.get(d))
      .filter((x): x is NonNullable<typeof x> => !!x);
    if (dias.length) anos.push({ ano: a, dias });
  }
  return anos;
}

export interface SerieJanela {
  dias: DiaClima[];
  normal: Map<string, Normal>;
  historico: Historico;
  fontes: Fonte[];
  limitacoes: string[];
  cobertura: Record<DiaClima["origem"], number>;
}

/**
 * Série diária unificada para qualquer janela (passada, presente ou futura):
 * passado → POWER · próximos 16 dias → previsão · até ~7 meses → sazonal · além → climatologia.
 */
export async function serieJanela(local: Local, periodo: Periodo): Promise<SerieJanela> {
  const historico = await carregarHistorico(local);
  const normal = climatologiaDiaria(historico);
  const h = hoje();
  const fimPrevisao = somarDias(h, 15);
  const fimSazonal = somarDias(h, 205);

  const precisaPassado = periodo.inicio < h;
  const precisaPrevisao = periodo.fim >= h && periodo.inicio <= fimPrevisao;
  const precisaSazonal = periodo.fim > fimPrevisao && periodo.inicio <= fimSazonal;

  const [passado, previsao, sazonal] = await Promise.all([
    precisaPassado
      ? buscarPowerDiario(local.lat, local.lon, periodo.inicio, periodo.fim < h ? periodo.fim : somarDias(h, -1), [
          "T2M_MAX",
          "T2M_MIN",
          "PRECTOTCORR",
          "WS2M",
        ]).catch(() => null)
      : null,
    precisaPrevisao ? buscarPrevisao(local.lat, local.lon).catch(() => null) : null,
    precisaSazonal ? buscarSazonal(local.lat, local.lon).catch(() => null) : null,
  ]);

  const porData = new Map<string, DiaClima>();
  if (passado) {
    for (const d of Object.keys(passado.serie.T2M_MIN ?? {})) {
      const tmin = passado.serie.T2M_MIN?.[d] ?? null;
      if (tmin == null) continue; // POWER tem atraso de alguns dias: dias sem dado ficam para a climatologia.
      porData.set(expande(d), {
        data: expande(d),
        tmin,
        tmax: passado.serie.T2M_MAX?.[d] ?? null,
        chuva: passado.serie.PRECTOTCORR?.[d] ?? null,
        vento: passado.serie.WS2M?.[d] != null ? passado.serie.WS2M[d]! * 3.6 : null,
        origem: "observado",
      });
    }
  }
  for (const d of previsao?.dias ?? []) if (!porData.has(d.data)) porData.set(d.data, d);
  for (const d of sazonal ?? []) if (!porData.has(d.data)) porData.set(d.data, d);

  const dias: DiaClima[] = listarDias(periodo.inicio, periodo.fim).map((data) => {
    const d = porData.get(data);
    if (d) return d;
    const n = normal.get(mesDia(data));
    return { data, tmin: n?.tmin ?? null, tmax: n?.tmax ?? null, chuva: n?.chuva ?? null, origem: "climatologia" };
  });

  const cobertura = { observado: 0, previsao: 0, previsao_sazonal: 0, climatologia: 0 };
  for (const d of dias) cobertura[d.origem]++;

  const fontes: Fonte[] = [{ ...FONTE_POWER, nome: `${FONTE_POWER.nome} — histórico ${historico.inicio.slice(0, 4)}–${historico.fim.slice(0, 4)}` }];
  const limitacoes: string[] = [
    "Dados em grade (~50 km no histórico NASA POWER): representam a região, não o talhão; baixadas e espigões podem ser mais frios ou quentes.",
  ];
  if (cobertura.previsao) fontes.push(FONTE_PREVISAO);
  if (cobertura.previsao_sazonal) {
    fontes.push(FONTE_SAZONAL);
    limitacoes.push(
      "Previsão sazonal (além de 16 dias) indica tendência, não o tempo de cada dia: use totais e médias do período, nunca datas específicas.",
      "A previsão sazonal é a saída bruta do modelo ECMWF, sem correção de viés; em Cianorte ela tende a ser mais chuvosa e mais fresca que o histórico. Confirme a tendência no boletim sazonal do INMET/CPTEC antes de decisões grandes.",
    );
  }
  if (cobertura.climatologia) {
    limitacoes.push(
      `${cobertura.climatologia} dia(s) da janela usam a média histórica (climatologia), por estarem além do alcance da previsão ou sem dado observado ainda.`,
    );
  }
  if (precisaPrevisao && !previsao) limitacoes.push("Previsão de 16 dias indisponível no momento; dias cobertos pela climatologia.");
  if (precisaSazonal && !sazonal) limitacoes.push("Previsão sazonal indisponível no momento; dias cobertos pela climatologia.");

  return { dias, normal, historico, fontes, limitacoes, cobertura };
}

/** Soma da normal de chuva na janela. */
export function chuvaNormal(normal: Map<string, Normal>, periodo: Periodo) {
  return listarDias(periodo.inicio, periodo.fim).reduce((a, d) => a + (normal.get(mesDia(d))?.chuva ?? 0), 0);
}
