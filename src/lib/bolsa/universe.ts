import type { BolsaMarket } from "./types";

export interface UniverseItem {
  symbol: string;
  name: string;
  market: BolsaMarket;
}

/** Lista padrão. O usuário pode adicionar/remover ativos em Configurações. */
export const DEFAULT_UNIVERSE: UniverseItem[] = [
  { symbol: "PETR4.SA", name: "Petrobras PN", market: "B3" },
  { symbol: "VALE3.SA", name: "Vale ON", market: "B3" },
  { symbol: "ITUB4.SA", name: "Itaú Unibanco PN", market: "B3" },
  { symbol: "BBDC4.SA", name: "Bradesco PN", market: "B3" },
  { symbol: "BBAS3.SA", name: "Banco do Brasil ON", market: "B3" },
  { symbol: "ABEV3.SA", name: "Ambev ON", market: "B3" },
  { symbol: "WEGE3.SA", name: "WEG ON", market: "B3" },
  { symbol: "B3SA3.SA", name: "B3 ON", market: "B3" },
  { symbol: "PRIO3.SA", name: "PRIO ON", market: "B3" },
  { symbol: "SUZB3.SA", name: "Suzano ON", market: "B3" },
  { symbol: "RENT3.SA", name: "Localiza ON", market: "B3" },
  { symbol: "AXIA3.SA", name: "Axia (ex-Eletrobras) ON", market: "B3" },
  { symbol: "MGLU3.SA", name: "Magazine Luiza ON", market: "B3" },
  { symbol: "AAPL", name: "Apple", market: "EUA" },
  { symbol: "MSFT", name: "Microsoft", market: "EUA" },
  { symbol: "NVDA", name: "Nvidia", market: "EUA" },
  { symbol: "TSLA", name: "Tesla", market: "EUA" },
  { symbol: "AMZN", name: "Amazon", market: "EUA" },
  { symbol: "GOOGL", name: "Alphabet", market: "EUA" },
  { symbol: "META", name: "Meta", market: "EUA" },
  { symbol: "AMD", name: "AMD", market: "EUA" },
  { symbol: "NFLX", name: "Netflix", market: "EUA" },
  { symbol: "JPM", name: "JPMorgan", market: "EUA" },
  { symbol: "BOVA11.SA", name: "ETF Ibovespa (BOVA11)", market: "Índices" },
  { symbol: "IVVB11.SA", name: "ETF S&P 500 em reais (IVVB11)", market: "Índices" },
  { symbol: "^BVSP", name: "Ibovespa", market: "Índices" },
  { symbol: "^GSPC", name: "S&P 500", market: "Índices" },
  { symbol: "^IXIC", name: "Nasdaq", market: "Índices" },
  { symbol: "BRL=X", name: "Dólar (USD/BRL)", market: "Cripto/Câmbio" },
  { symbol: "BTC-USD", name: "Bitcoin", market: "Cripto/Câmbio" },
  { symbol: "ETH-USD", name: "Ethereum", market: "Cripto/Câmbio" },
];

/**
 * Como comprar pelo Brasil: ações americanas viram BDRs na B3 e cripto vira ETF na B3.
 * Preço em reais (já inclui o dólar), comprável em qualquer corretora brasileira.
 */
export const B3_EQUIVALENT: Record<string, { symbol: string; note: string }> = {
  AAPL: { symbol: "AAPL34.SA", note: "BDR da Apple" },
  MSFT: { symbol: "MSFT34.SA", note: "BDR da Microsoft" },
  NVDA: { symbol: "NVDC34.SA", note: "BDR da Nvidia" },
  TSLA: { symbol: "TSLA34.SA", note: "BDR da Tesla" },
  AMZN: { symbol: "AMZO34.SA", note: "BDR da Amazon" },
  GOOGL: { symbol: "GOGL34.SA", note: "BDR da Alphabet" },
  META: { symbol: "M1TA34.SA", note: "BDR da Meta" },
  AMD: { symbol: "A1MD34.SA", note: "BDR da AMD" },
  NFLX: { symbol: "NFLX34.SA", note: "BDR da Netflix" },
  JPM: { symbol: "JPMC34.SA", note: "BDR do JPMorgan" },
  "BTC-USD": { symbol: "QBTC11.SA", note: "ETF de Bitcoin na B3" },
  "ETH-USD": { symbol: "QETH11.SA", note: "ETF de Ethereum na B3" },
};

/** Código que se compra de verdade numa corretora brasileira. */
export function execSymbol(symbol: string) {
  return B3_EQUIVALENT[symbol]?.symbol ?? symbol;
}

/** Ações do Ibovespa usadas no teste longo e na parte de momento (além das da lista padrão). */
const IBOV_EXTRA = [
  "ITSA4", "BPAC11", "SANB11", "BBSE3", "CMIG4", "CPLE3", "EQTL3", "SBSP3", "GGBR4", "CSNA3", "USIM5", "CMIN3",
  "RAIL3", "MOTV3", "EMBJ3", "JBSS32", "MBRF3", "RADL3", "LREN3", "HYPE3", "TOTS3", "VIVT3", "TIMS3", "KLBN11",
  "CSAN3", "UGPA3", "VBBR3", "RDOR3", "HAPV3", "CPFE3", "ENGI11", "EGIE3", "TAEE11", "SAPR11", "CYRE3", "MULT3",
  "ASAI3", "NATU3", "BRAP4", "GOAU4", "CXSE3", "PSSA3", "IRBR3", "ALOS3", "SMTO3", "SLCE3", "RECV3", "BEEF3",
  "COGN3", "YDUQ3", "ENEV3", "EZTC3", "MRVE3", "AURE3", "DIRR3", "VAMO3", "BRAV3", "POMO4", "CVCB3", "FLRY3",
].map((s) => `${s}.SA`);

/** Tudo que a regra de momento pode comprar pelo Brasil: ações da B3, BDRs e ETFs de cripto. */
export const MOMENTUM_UNIVERSE: string[] = [
  ...new Set([
    ...DEFAULT_UNIVERSE.filter((u) => u.symbol.endsWith(".SA") && u.market === "B3").map((u) => u.symbol),
    ...IBOV_EXTRA,
    ...Object.values(B3_EQUIVALENT).map((e) => e.symbol),
  ]),
];

/** ETFs do núcleo: o mercado brasileiro e o americano inteiros. */
export const CORE_ETFS = ["BOVA11.SA", "IVVB11.SA"];

export function guessMarket(symbol: string): BolsaMarket {
  if (symbol.endsWith(".SA")) return "B3";
  if (symbol.startsWith("^")) return "Índices";
  if (symbol.includes("=X") || symbol.includes("-USD") || symbol.includes("-BRL")) return "Cripto/Câmbio";
  return "EUA";
}

export function displaySymbol(symbol: string): string {
  if (symbol === "^BVSP") return "IBOV";
  if (symbol === "^GSPC") return "SPX";
  if (symbol === "^IXIC") return "NDX";
  if (symbol === "BRL=X") return "USD/BRL";
  return symbol.replace(/\.SA$/, "").replace(/-USD$/, "");
}

/** Aceita "petr4", "PETR4", "PETR4.SA", "aapl", "btc"… e devolve o código do Yahoo. */
export function normalizeSymbol(input: string): string {
  const s = input.trim().toUpperCase();
  if (!s) return s;
  if (/^[A-Z]{4}\d{1,2}$/.test(s)) return `${s}.SA`;
  if (["BTC", "ETH", "SOL", "XRP", "DOGE"].includes(s)) return `${s}-USD`;
  return s;
}
