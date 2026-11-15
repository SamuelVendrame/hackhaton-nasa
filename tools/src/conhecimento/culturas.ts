/**
 * Características de referência das culturas, para cruzar com clima, solo e rotação.
 *
 * ATENÇÃO: valores aproximados de literatura agronômica geral (Embrapa, FAO-56, IAPAR/IDR-PR),
 * para uso como ponto de partida. Precisam de validação por agrônomo antes de uso real e variam
 * por cultivar, região e manejo. Cada campo é usado pelos mapeamentos só como sinal, nunca como regra fechada.
 */
export type Familia = "leguminosa" | "gramínea" | "solanácea" | "euforbiácea" | "asterácea" | "malvácea" | "rubiácea";

export interface Cultura {
  id: string;
  nome: string;
  familia: Familia;
  fixaNitrogenio: boolean;
  /** Ciclo típico em dias, do plantio à colheita. */
  cicloDias: [number, number];
  /** Faixa de temperatura média favorável (°C). */
  tempOtima: [number, number];
  /** Máxima diária a partir da qual há estresse por calor, sobretudo na floração (°C). */
  limiteCalor: number;
  /** Sensibilidade a geada: alta = perda com geada leve; baixa = tolera. */
  sensibilidadeGeada: "alta" | "media" | "baixa";
  /** Necessidade hídrica aproximada no ciclo (mm). */
  aguaCicloMm: [number, number];
  /** Tolerância a solo encharcado / excesso de chuva. */
  toleranciaExcessoAgua: "baixa" | "media" | "alta";
  /** Doenças/pragas de solo relevantes para a rotação (compartilhadas = risco ao suceder). */
  problemasSolo: string[];
  /** Benefícios típicos para o sistema. */
  beneficios: string[];
  /** Nomes nas fontes, para cruzar dados. */
  nomes: { zarc?: string[]; deral?: string[]; sidra?: string[] };
}

export const CULTURAS: Cultura[] = [
  {
    id: "soja",
    nome: "Soja",
    familia: "leguminosa",
    fixaNitrogenio: true,
    cicloDias: [100, 140],
    tempOtima: [20, 30],
    limiteCalor: 35,
    sensibilidadeGeada: "alta",
    aguaCicloMm: [450, 800],
    toleranciaExcessoAgua: "baixa",
    problemasSolo: ["nematoide de cisto", "nematoide das lesões", "mofo branco (Sclerotinia)", "podridão de raiz (Fusarium)"],
    beneficios: ["fixa nitrogênio", "liquidez de mercado e cooperativa"],
    nomes: { zarc: ["Soja"], deral: ["Soja"], sidra: ["Soja (em grão)"] },
  },
  {
    id: "milho",
    nome: "Milho (1ª safra)",
    familia: "gramínea",
    fixaNitrogenio: false,
    cicloDias: [120, 150],
    tempOtima: [24, 30],
    limiteCalor: 35,
    sensibilidadeGeada: "alta",
    aguaCicloMm: [500, 800],
    toleranciaExcessoAgua: "media",
    problemasSolo: ["nematoide das lesões", "cigarrinha / enfezamentos"],
    beneficios: ["muita palhada (cobertura e matéria orgânica)", "quebra ciclo de doenças de leguminosas"],
    nomes: { zarc: ["Milho 1ª Safra", "Milho 1ª Safra consorciado com Braquiária"], deral: ["Milho"], sidra: ["Milho (em grão)"] },
  },
  {
    id: "milho-safrinha",
    nome: "Milho (2ª safra / safrinha)",
    familia: "gramínea",
    fixaNitrogenio: false,
    cicloDias: [110, 140],
    tempOtima: [22, 30],
    limiteCalor: 35,
    sensibilidadeGeada: "alta",
    aguaCicloMm: [400, 650],
    toleranciaExcessoAgua: "media",
    problemasSolo: ["nematoide das lesões", "cigarrinha / enfezamentos"],
    beneficios: ["palhada", "renda na 2ª safra após soja"],
    nomes: { zarc: ["Milho 2ª Safra", "Milho 2ª Safra consorciado com Braquiária"], deral: ["Milho"], sidra: ["Milho (em grão)"] },
  },
  {
    id: "feijao",
    nome: "Feijão",
    familia: "leguminosa",
    fixaNitrogenio: true,
    cicloDias: [80, 100],
    tempOtima: [18, 28],
    limiteCalor: 32,
    sensibilidadeGeada: "alta",
    aguaCicloMm: [300, 500],
    toleranciaExcessoAgua: "baixa",
    problemasSolo: ["mofo branco (Sclerotinia)", "podridões radiculares (Fusarium, Rhizoctonia)", "nematoides"],
    beneficios: ["ciclo curto", "fixa nitrogênio (parcialmente)", "preço alto em anos de oferta baixa"],
    nomes: { zarc: ["Feijão", "Feijão 2ª Safra"], deral: ["Feijao de cor", "Feijao preto"], sidra: ["Feijão (em grão)"] },
  },
  {
    id: "mandioca",
    nome: "Mandioca",
    familia: "euforbiácea",
    fixaNitrogenio: false,
    cicloDias: [300, 600],
    tempOtima: [20, 27],
    limiteCalor: 37,
    sensibilidadeGeada: "media",
    aguaCicloMm: [1000, 1500],
    toleranciaExcessoAgua: "baixa",
    problemasSolo: ["podridão radicular (Phytophthora)", "bacteriose"],
    beneficios: ["tolera solo arenoso e veranico", "mercado de fecularias no noroeste do PR"],
    nomes: { zarc: ["Mandioca (aipim, macaxeira)"], deral: ["Mandioca consumo", "Mandioca industria"], sidra: ["Mandioca"] },
  },
  {
    id: "cana",
    nome: "Cana-de-açúcar",
    familia: "gramínea",
    fixaNitrogenio: false,
    cicloDias: [365, 540],
    tempOtima: [22, 32],
    limiteCalor: 38,
    sensibilidadeGeada: "media",
    aguaCicloMm: [1200, 2000],
    toleranciaExcessoAgua: "media",
    problemasSolo: ["nematoides", "migdolus", "sphenophorus"],
    beneficios: ["contrato com usina", "cobertura longa do solo"],
    nomes: { zarc: ["Cana-de-Açúcar (açúcar e álcool)", "Cana-de-Açúcar (outros fins)"], deral: ["Cana-de-acucar"], sidra: ["Cana-de-açúcar"] },
  },
  {
    id: "trigo",
    nome: "Trigo",
    familia: "gramínea",
    fixaNitrogenio: false,
    cicloDias: [110, 140],
    tempOtima: [15, 22],
    limiteCalor: 30,
    sensibilidadeGeada: "media",
    aguaCicloMm: [350, 500],
    toleranciaExcessoAgua: "media",
    problemasSolo: ["mal-do-pé", "brusone (clima quente e úmido)"],
    beneficios: ["cultura de inverno", "palhada", "quebra ciclo de leguminosas"],
    nomes: { zarc: ["Trigo"], deral: ["Trigo"], sidra: ["Trigo (em grão)"] },
  },
  {
    id: "aveia",
    nome: "Aveia",
    familia: "gramínea",
    fixaNitrogenio: false,
    cicloDias: [90, 140],
    tempOtima: [13, 22],
    limiteCalor: 30,
    sensibilidadeGeada: "baixa",
    aguaCicloMm: [300, 450],
    toleranciaExcessoAgua: "media",
    problemasSolo: [],
    beneficios: ["cobertura de inverno", "forragem", "reduz nematoides e plantas daninhas"],
    nomes: { zarc: ["Aveia"], deral: ["Aveia branca"], sidra: ["Aveia (em grão)"] },
  },
  {
    id: "sorgo",
    nome: "Sorgo granífero",
    familia: "gramínea",
    fixaNitrogenio: false,
    cicloDias: [100, 130],
    tempOtima: [25, 32],
    limiteCalor: 38,
    sensibilidadeGeada: "alta",
    aguaCicloMm: [350, 550],
    toleranciaExcessoAgua: "media",
    problemasSolo: [],
    beneficios: ["tolera seca melhor que o milho", "palhada", "opção de 2ª safra com risco climático menor"],
    nomes: { zarc: ["Sorgo Granífero", "Sorgo Granífero 2ª Safra"], sidra: ["Sorgo (em grão)"] },
  },
  {
    id: "amendoim",
    nome: "Amendoim",
    familia: "leguminosa",
    fixaNitrogenio: true,
    cicloDias: [100, 130],
    tempOtima: [22, 30],
    limiteCalor: 35,
    sensibilidadeGeada: "alta",
    aguaCicloMm: [450, 700],
    toleranciaExcessoAgua: "baixa",
    problemasSolo: ["nematoides", "podridões (Sclerotium)"],
    beneficios: ["adapta-se a solo arenoso", "fixa nitrogênio", "usado na renovação de canavial"],
    nomes: { zarc: ["Amendoim"], deral: ["Amendoim em casca"], sidra: ["Amendoim (em casca)"] },
  },
  {
    id: "batata",
    nome: "Batata",
    familia: "solanácea",
    fixaNitrogenio: false,
    cicloDias: [90, 120],
    tempOtima: [15, 22],
    limiteCalor: 29,
    sensibilidadeGeada: "alta",
    aguaCicloMm: [350, 600],
    toleranciaExcessoAgua: "baixa",
    problemasSolo: ["murcha bacteriana (Ralstonia)", "nematoide das galhas", "requeima (clima úmido)"],
    beneficios: ["alto valor por hectare"],
    nomes: { deral: ["Batata lisa"], sidra: ["Batata-inglesa"] },
  },
  {
    id: "girassol",
    nome: "Girassol",
    familia: "asterácea",
    fixaNitrogenio: false,
    cicloDias: [90, 130],
    tempOtima: [20, 28],
    limiteCalor: 35,
    sensibilidadeGeada: "media",
    aguaCicloMm: [400, 600],
    toleranciaExcessoAgua: "baixa",
    problemasSolo: ["mofo branco (Sclerotinia)"],
    beneficios: ["raiz profunda (recicla nutrientes)", "tolera seca"],
    nomes: { zarc: ["Girassol"], sidra: ["Girassol (em grão)"] },
  },
];

export function acharCultura(nomeOuId: string): Cultura | undefined {
  const n = nomeOuId.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
  return (
    CULTURAS.find((c) => c.id === n) ??
    CULTURAS.find((c) => c.nome.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().startsWith(n)) ??
    CULTURAS.find((c) => n.includes(c.id))
  );
}
