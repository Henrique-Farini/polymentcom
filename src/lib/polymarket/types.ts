export interface PolyMarket {
  id: string;
  /** Texto curto: o resultado em disputa (ex: "Sim", nome do candidato). */
  title: string;
  question: string;
  eventTitle: string;
  eventSlug: string;
  slug: string;
  category: string;
  image: string | null;
  outcomes: string[];
  prices: number[];
  /** Probabilidade do primeiro resultado ("Yes"), 0–1. */
  probability: number;
  /** Variações em pontos de probabilidade (0.05 = +5 pontos). */
  change1h: number | null;
  change24h: number | null;
  change1w: number | null;
  volume24h: number;
  volume1w: number;
  liquidity: number;
  spread: number | null;
  bestBid: number | null;
  bestAsk: number | null;
  endDate: string | null;
  tokenIds: string[];
}

export interface PolyHistoryPoint {
  t: number;
  p: number;
}

export interface BookLevel {
  price: number;
  size: number;
}

export interface PolyMarketDetail {
  market: PolyMarket;
  description: string;
  history: PolyHistoryPoint[];
  book: { bids: BookLevel[]; asks: BookLevel[] } | null;
}

export const POLY_CATEGORIES = [
  "Política",
  "Economia",
  "Cripto",
  "Geopolítica",
  "Tecnologia",
  "Esportes",
  "Cultura",
  "Outros",
] as const;
