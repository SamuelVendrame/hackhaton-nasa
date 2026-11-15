import { decendio, descreverDecendio, hoje } from "../core/calc";
import { ErroFonte } from "../core/http";
import { resultado, type Local } from "../core/tipos";
import { acharCultura } from "../conhecimento/culturas";
import { buscarZarcMunicipio, FONTE_ZARC, safraDaData, type LinhaZarc } from "../fontes/zarc";

/**
 * Faixas contínuas de decêndios indicados (risco > 0), tratando o ano como circular:
 * uma janela de 21/dez a 20/mar vira uma faixa só, e não duas.
 */
export function faixasIndicadas(riscos: number[]) {
  const n = riscos.length;
  if (riscos.every((r) => r > 0)) return [{ de: descreverDecendio(1), ate: descreverDecendio(n), menorRisco: Math.min(...riscos) }];
  // Começa a varredura logo após um decêndio não indicado, para não cortar faixas na virada do ano.
  const inicio = riscos.findIndex((r) => r === 0);
  const faixas: { de: string; ate: string; menorRisco: number }[] = [];
  let ini: number | null = null;
  let menor = 99;
  for (let k = 1; k <= n; k++) {
    const i = (inicio + k) % n;
    if (riscos[i]! > 0) {
      if (ini == null) ini = i;
      menor = Math.min(menor, riscos[i]!);
    } else if (ini != null) {
      const fim = (i - 1 + n) % n;
      faixas.push({ de: descreverDecendio(ini + 1), ate: descreverDecendio(fim + 1), menorRisco: menor });
      ini = null;
      menor = 99;
    }
  }
  return faixas;
}

/**
 * Cruza a data pretendida de plantio com o ZARC: o plantio está indicado? com que risco?
 * Se não estiver, quais são os decêndios indicados mais próximos?
 */
export function avaliarJanelaZarc(linhas: LinhaZarc[], dataIso: string, filtroSolo?: string) {
  const dec = decendio(dataIso);
  const alvo = filtroSolo ? linhas.filter((l) => l.solo.toLowerCase() === filtroSolo.toLowerCase()) : linhas;
  const combinacoes = alvo.map((l) => ({
    solo: l.solo,
    ciclo: l.ciclo,
    manejo: l.manejo,
    nivelManejo: l.nivelManejo,
    riscoNaData: l.risco[dec - 1] ?? 0,
  }));
  const indicadas = combinacoes.filter((c) => c.riscoNaData > 0);
  const menorRisco = indicadas.length ? Math.min(...indicadas.map((c) => c.riscoNaData)) : null;

  // Calendário consolidado: para cada decêndio, o menor risco entre solos/ciclos (0 = nenhum indica).
  const calendario = Array.from({ length: 36 }, (_, i) => {
    const riscos = alvo.map((l) => l.risco[i] ?? 0).filter((r) => r > 0);
    return { decendio: i + 1, periodo: descreverDecendio(i + 1), menorRisco: riscos.length ? Math.min(...riscos) : 0, combinacoesIndicadas: riscos.length };
  });

  // Próximos decêndios indicados a partir da data (circular no ano).
  const proximos: typeof calendario = [];
  for (let k = 0; k < 36 && proximos.length < 6; k++) {
    const c = calendario[(dec - 1 + k) % 36]!;
    if (c.menorRisco > 0) proximos.push(c);
  }

  const faixas = faixasIndicadas(calendario.map((c) => c.menorRisco));

  return {
    decendio: dec,
    periodoDecendio: descreverDecendio(dec),
    indicadoNaData: indicadas.length > 0,
    menorRiscoNaData: menorRisco,
    combinacoesIndicadasNaData: indicadas,
    totalCombinacoes: combinacoes.length,
    janelasIndicadas: faixas,
    proximosDecendiosIndicados: proximos,
    portarias: [...new Set(alvo.map((l) => l.portaria))],
  };
}

export async function janelaPlantio(local: Local, cultura: string, data = hoje(), solo?: string, manejo = "Sequeiro") {
  if (!local.ibge) throw new ErroFonte("zarc", "código IBGE do município é necessário");
  const c = acharCultura(cultura);
  const nomesZarc = c?.nomes.zarc ?? [cultura];
  const safra = safraDaData(data);
  const todas = await buscarZarcMunicipio(local.ibge, safra);
  const culturasDisponiveis = [...new Set(todas.map((l) => l.cultura))];

  const porNome = nomesZarc.map((nome) => {
    const linhas = todas.filter((l) => l.cultura === nome && l.manejo.toLowerCase() === manejo.toLowerCase());
    return { culturaZarc: nome, linhas };
  }).filter((x) => x.linhas.length);

  if (!porNome.length)
    return resultado("janela_plantio", {
      local,
      resumo: [
        `O ZARC ${safra} não tem zoneamento de ${c?.nome ?? cultura} (${manejo}) para ${local.municipio ?? local.ibge}. Culturas zoneadas no município: ${culturasDisponiveis.join(", ")}.`,
      ],
      dados: { cultura, safra, zoneada: false, culturasDisponiveis },
      fontes: [FONTE_ZARC],
      limitacoes: ["Ausência de zoneamento não significa que a cultura não possa ser plantada, mas o plantio fica sem a referência oficial de risco (e em geral sem Proagro/seguro subsidiado)."],
    });

  const avaliacoes = porNome.map((p) => ({ culturaZarc: p.culturaZarc, ...avaliarJanelaZarc(p.linhas, data, solo) }));
  const resumo = avaliacoes.map((a) => {
    const janelas = a.janelasIndicadas.map((f) => `${f.de === f.ate ? f.de : `${f.de} a ${f.ate}`} (risco mínimo ${f.menorRisco}%)`).join("; ");
    return a.indicadoNaData
      ? `${a.culturaZarc}: plantio em ${a.periodoDecendio} está INDICADO pelo ZARC ${safra} em ${a.combinacoesIndicadasNaData.length} de ${a.totalCombinacoes} combinações de solo/ciclo, com risco mínimo de ${a.menorRiscoNaData}%. Janelas do ano: ${janelas}.`
      : `${a.culturaZarc}: plantio em ${a.periodoDecendio} NÃO está indicado pelo ZARC ${safra}. Próximo decêndio indicado: ${a.proximosDecendiosIndicados[0]?.periodo ?? "nenhum"}. Janelas do ano: ${janelas || "nenhuma"}.`;
  });
  return resultado("janela_plantio", {
    local,
    resumo,
    dados: { cultura: c?.nome ?? cultura, safra, manejo, filtroSolo: solo ?? null, zoneada: true, avaliacoes },
    fontes: [FONTE_ZARC],
    limitacoes: [
      "Risco do ZARC = probabilidade de perda de até 20%, 30% ou 40% por fatores climáticos, para o tipo de solo (AD1 = menor água disponível … AD6 = maior) e o grupo de ciclo da cultivar.",
      "O tipo de solo do talhão (classe AD) define qual linha vale; sem a análise, consideramos todas as combinações.",
    ],
  });
}
