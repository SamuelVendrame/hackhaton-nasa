// Monta a comparação dos três caminhos de rotação para a área do milho.
// Os números de clima vêm do NASA POWER (public/data/nasa-cianorte.json).
// As recomendações agronômicas são regras simples de demonstração e precisam
// ser validadas por um agrônomo.
// Usado pelo app (navegador) e pelo servidor (contexto do Cid).

export const NIVEIS = {
  bom: { rotulo: 'Bom' },
  atencao: { rotulo: 'Atenção' },
  ruim: { rotulo: 'Risco' },
};

export function fatosDoClima(nasa) {
  const a = nasa.periodos.antigo;
  const r = nasa.periodos.recente;
  return [
    {
      id: 'chuva-outono',
      titulo: 'Chuva de abril e maio',
      agora: `${r.chuvaAbrMai} mm`,
      antes: `${a.chuvaAbrMai} mm`,
      variacao: `${Math.round((100 * (r.chuvaAbrMai - a.chuvaAbrMai)) / a.chuvaAbrMai)}%`,
      texto: `O outono ficou mais seco: abril e maio somam ${r.chuvaAbrMai} mm hoje, eram ${a.chuvaAbrMai} mm.`,
    },
    {
      id: 'veranico',
      titulo: 'Outono com 15 dias ou mais sem chuva',
      agora: `${r.anosComVeranico15} de ${r.totalAnos} anos`,
      antes: `${a.anosComVeranico15} de ${a.totalAnos} anos`,
      variacao: null,
      texto: `Veranico longo no outono aconteceu em ${r.anosComVeranico15} dos últimos ${r.totalAnos} anos, antes era em ${a.anosComVeranico15}.`,
    },
    {
      id: 'calor',
      titulo: 'Dias acima de 35 °C por ano',
      agora: `${Math.round(r.diasCalorAno)} dias`,
      antes: `${Math.round(a.diasCalorAno)} dias`,
      variacao: null,
      texto: `Os dias acima de 35 °C passaram de ${Math.round(a.diasCalorAno)} para ${Math.round(r.diasCalorAno)} por ano, e foram ${Math.round(nasa.diasCalorUltimos5Anos)} na média dos últimos 5 anos.`,
    },
  ];
}

export function montarCaminhos(nasa, fazenda) {
  const a = nasa.periodos.antigo;
  const r = nasa.periodos.recente;
  const area = fazenda.lavouras.find((l) => l.id === 'milho');
  const contratos = fazenda.propriedade.cooperativa.contratos;
  const preco = (cultura) => contratos.find((c) => c.cultura === cultura)?.precoSaca;
  const quedaOutono = Math.round((100 * (a.chuvaAbrMai - r.chuvaAbrMai)) / a.chuvaAbrMai);
  const milhosSeguidos = contarSeguidos(area.historico, 'Milho') + 1;

  return {
    area: area.id,
    titulo: `O que plantar depois do milho`,
    subtitulo: `${area.nome} · ${area.hectares} ha · colheita prevista em fevereiro`,
    janela: 'Próximo plantio entre 20 de fevereiro e 10 de março',
    caminhos: [
      {
        id: 'milho',
        nome: 'Milho safrinha de novo',
        etiqueta: 'Como está hoje',
        porque: `É o que ${fazenda.produtor.tratamento} já faz: tem a máquina, conhece o manejo e a cooperativa compra no pré-fixado.`,
        criterios: [
          {
            nome: 'Água',
            nivel: 'ruim',
            texto: `A janela do milho safrinha recebe ${r.chuvaJanelaSafrinha} mm em média hoje (eram ${a.chuvaJanelaSafrinha}). Em ${r.anosComVeranico15} dos últimos ${r.totalAnos} anos faltou chuva por 15 dias ou mais no outono, bem na florada.`,
          },
          {
            nome: 'Geada',
            nivel: 'atencao',
            texto: `Em ${r.pctAnosGeadaSafrinha}% dos anos fez frio de geada entre 15 de maio e julho, quando o milho plantado tarde ainda está enchendo grão.`,
          },
          {
            nome: 'Solo',
            nivel: 'ruim',
            texto: `Seria o ${ordinal(milhosSeguidos)} milho seguido nesta área. O milho puxa muito nitrogênio e a cigarrinha continua no lugar.`,
          },
          {
            nome: 'Venda',
            nivel: 'bom',
            texto: `Contrato pré-fixado na cooperativa: R$ ${preco('Milho')} a saca (valor de exemplo).`,
          },
        ],
        beneficios: ['Preço garantido no contrato', 'Sem mudar máquina nem manejo', 'Deixa palha no solo'],
        riscos: ['Quebra se faltar chuva em abril', 'Geada se o plantio passar de março', 'Cigarrinha e enfezamento com milho atrás de milho'],
        lacunas: ['Data certa da colheita do milho de verão', 'Análise de solo deste ano'],
        fala: `Continuar com o milho safrinha mantém o preço garantido da cooperativa. O risco é a água: o outono anda mais seco e em ${r.anosComVeranico15} dos últimos ${r.totalAnos} anos faltou chuva na florada. E seria o ${ordinal(milhosSeguidos)} milho seguido nesta área.`,
      },
      {
        id: 'feijao',
        nome: 'Feijão da seca',
        etiqueta: 'Rotação curta',
        porque: 'O feijão ajuda a repor nitrogênio e quebra a sequência de milho. O ciclo é curto: plantando no fim de fevereiro, colhe em maio.',
        criterios: [
          {
            nome: 'Água',
            nivel: 'atencao',
            texto: `Pede menos água que o milho, mas sofre se faltar chuva na florada. Abril e maio perderam ${quedaOutono}% da chuva: eram ${a.chuvaAbrMai} mm, hoje ${r.chuvaAbrMai} mm.`,
          },
          {
            nome: 'Geada',
            nivel: 'bom',
            texto: `Colhe antes do frio. Geada em maio aconteceu em só ${r.pctAnosGeadaMaio}% dos anos recentes.`,
          },
          {
            nome: 'Solo',
            nivel: 'bom',
            texto: 'Devolve parte do nitrogênio ao solo e corta o ciclo das pragas do milho.',
          },
          {
            nome: 'Venda',
            nivel: 'ruim',
            texto: fazenda.propriedade.cooperativa.observacao,
          },
        ],
        beneficios: ['Rotação de verdade: sai do milho', 'Colhe antes da geada', 'Libera a área cedo'],
        riscos: ['Preço sem garantia', 'Chuva forte na colheita estraga o grão', 'Pede mais mão de obra'],
        lacunas: ['Quem compra feijão na região', 'Se há semente boa em fevereiro'],
        fala: `O feijão da seca colhe em maio, antes da geada, e ajuda o solo a se recuperar do milho. O ponto fraco é a venda: a cooperativa não compra feijão, então o preço não é garantido.`,
      },
      {
        id: 'sorgo',
        nome: 'Sorgo com braquiária',
        etiqueta: 'Aguenta seca',
        porque: 'O sorgo aguenta melhor a falta de chuva que o milho. A braquiária plantada junto fica cobrindo o solo arenoso depois da colheita.',
        criterios: [
          {
            nome: 'Água',
            nivel: 'atencao',
            texto: `O maior período sem chuva no outono passou de ${Math.round(a.veranicoOutonoMedio)} para ${Math.round(r.veranicoOutonoMedio)} dias, em média. O sorgo tolera melhor essas paradas.`,
          },
          {
            nome: 'Geada',
            nivel: 'atencao',
            texto: 'Também fica no campo até junho. Plantar cedo, até o começo de março, diminui o risco.',
          },
          {
            nome: 'Solo',
            nivel: 'bom',
            texto: 'A braquiária cobre o chão e as raízes fundas seguram a terra e ajudam a água a entrar. Bom para solo arenoso.',
          },
          {
            nome: 'Venda',
            nivel: 'atencao',
            texto: `A cooperativa compra no pré-fixado, mas paga menos que o milho: R$ ${preco('Sorgo')} a saca (valor de exemplo). A braquiária pode virar pasto no inverno.`,
          },
        ],
        beneficios: ['Mais resistente à seca', 'Protege o solo contra erosão', 'Pasto no inverno'],
        riscos: ['Preço menor que o do milho', 'A braquiária precisa de manejo para não competir com o sorgo', 'Dessecar a braquiária antes do plantio de verão'],
        lacunas: ['Se a cooperativa confirma o contrato de sorgo', 'Se há gado ou alguém para arrendar o pasto'],
        fala: `O sorgo com braquiária aguenta melhor o outono seco e deixa o solo coberto, o que é bom para terra arenosa. A cooperativa compra, mas paga menos que o milho.`,
      },
    ],
  };
}

function contarSeguidos(historico, cultura) {
  let n = 0;
  for (let i = historico.length - 1; i >= 0; i--) {
    if (historico[i].cultura !== cultura) break;
    n++;
  }
  return n;
}

function ordinal(n) {
  return ['primeiro', 'segundo', 'terceiro', 'quarto', 'quinto'][n - 1] || `${n}º`;
}
