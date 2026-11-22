export type BolsaMarket = "B3" | "EUA" | "Índices" | "Cripto/Câmbio";

export interface BolsaAsset {
  symbol: string;
  display: string;
  name: string;
  market: BolsaMarket;
  currency: string;
  price: number;
  /** Variação do dia em %. */
  changePct: number;
  /** Variação do dia em valor. */
  changeAbs: number | null;
  dayOpen: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  volume: number;
  volRatio: number | null;
  ma9: number | null;
  ma21: number | null;
  ma200: number | null;
  rsi14: number | null;
  macdHist: number | null;
  macdHistPrev: number | null;
  percentB: number | null;
  atrPct: number | null;
  high52: number | null;
  low52: number | null;
  spark: number[];
  /** Horário da última negociação (ms). */
  marketTime: number;
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface BolsaAssetDetail {
  asset: BolsaAsset;
  candles: Candle[];
  range: string;
}
