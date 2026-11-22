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
