import type { BolsaMarket } from "@/lib/bolsa/types";
import type { CalibrationBucket, OutcomeBucket } from "@/lib/stats";

export interface AssetStats {
  symbol: string;
  display: string;
  name: string;
  market: BolsaMarket;
  price: number;
  ret1m: number | null;
  ret3m: number | null;
  ret6m: number | null;
  ret1y: number | null;
  /** retorno anualizado no período disponível (até 5 anos) */
  cagr: number | null;
  years: number;
  vol1y: number | null;
  /** retorno médio anualizado ÷ volatilidade (sem taxa livre de risco) */
  retRisk1y: number | null;
  mdd1y: number | null;
  mdd5y: number | null;
  upDays1y: number | null;
  beta1y: number | null;
  benchmark: string | null;
  /** distância da máxima de 52 semanas (negativo) */
  fromHigh: number | null;
  seasonality: (number | null)[];
  seasonalityPositive: (number | null)[];
}

export interface GroupStats {
  market: BolsaMarket;
  n: number;
  medRet1y: number;
  medVol1y: number;
  medRetRisk: number;
  medMdd1y: number;
  positive1y: number;
}

export interface BolsaAnalysis {
  assets: AssetStats[];
  groups: GroupStats[];
  correlation: { symbols: string[]; matrix: (number | null)[][] };
  backtest: {
    horizon: number;
    years: number;
    trend: OutcomeBucket[];
    rsi: OutcomeBucket[];
    baseline: OutcomeBucket;
    byMarket: { market: BolsaMarket; trend: OutcomeBucket[]; baseline: OutcomeBucket }[];
  };
  failed: string[];
  at: number;
}

export interface CategoryCalibration {
  category: string;
  markets: number;
  brier: number;
  /** ROI médio de comprar favoritos (preço ≥ 70%) */
  roiFavorites: number | null;
  nFavorites: number;
  /** ROI médio de comprar azarões (preço ≤ 30%) */
  roiLongshots: number | null;
  nLongshots: number;
}

export interface PolyAnalysis {
  markets: number;
  samples: number;
  hoursBefore: number;
  windowDays: number;
  brier: number;
  buckets: CalibrationBucket[];
  categories: CategoryCalibration[];
  at: number;
}
