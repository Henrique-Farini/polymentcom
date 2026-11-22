export type SignalStatus = "destaque" | "neutro" | "alerta";

export interface ScoreComponent {
  key: string;
  label: string;
  /** Nota do critério de 0 a 1. */
  value: number;
  /** Peso configurado. */
  weight: number;
  /** Pontos que esse critério soma no score final (0–100). */
  points: number;
  /** Frase curta explicando a nota. */
  note: string;
}

export interface ScoreResult {
  score: number;
  status: SignalStatus;
  components: ScoreComponent[];
  /** Motivos positivos mais fortes, em texto. */
  reasons: string[];
  /** Motivos de alerta (queda forte, risco). */
  alerts: string[];
}

export interface BolsaSettings {
  weights: { tendencia: number; momento: number; volume: number; volatilidade: number; dia: number };
  /** Score mínimo para entrar em "Em destaque". */
  minScore: number;
  /** Queda do dia (%) que coloca o ativo em alerta. */
  dropPct: number;
  /** Score abaixo do qual o ativo vai para alerta. */
  alertScore: number;
}

export interface PolySettings {
  weights: { momento: number; volume: number; liquidez: number; spread: number; tempo: number };
  minScore: number;
  /** Queda em 24h (pontos de probabilidade) que gera alerta. */
  dropPts24h: number;
  /** Queda em 1h (pontos) que gera alerta. */
  dropPts1h: number;
  /** Liquidez mínima em US$ abaixo da qual o sinal é pouco confiável. */
  minLiquidity: number;
  /** Spread máximo (em pontos) antes de virar alerta. */
  maxSpreadPts: number;
}

export const DEFAULT_BOLSA_SETTINGS: BolsaSettings = {
  weights: { tendencia: 30, momento: 25, volume: 20, volatilidade: 15, dia: 10 },
  minScore: 65,
  dropPct: 4,
  alertScore: 30,
};

export const DEFAULT_POLY_SETTINGS: PolySettings = {
  weights: { momento: 35, volume: 25, liquidez: 20, spread: 10, tempo: 10 },
  minScore: 65,
  dropPts24h: 10,
  dropPts1h: 5,
  minLiquidity: 5_000,
  maxSpreadPts: 5,
};
