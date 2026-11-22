/** Estatísticas de séries de preços e de calibração. Funções puras. */

import { rsiSeries, smaSeries } from "./indicators";
import { trendOf, type Trend } from "./bolsa/trend";

export const TRADING_DAYS = 252;

export function simpleReturns(closes: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++) out.push(closes[i] / closes[i - 1] - 1);
  return out;
}

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
}

export function median(xs: number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function stdev(xs: number[]): number {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

/** Retorno do período: últimos `days` pregões. */
export function periodReturn(closes: number[], days: number): number | null {
  if (closes.length <= days) return null;
  return closes[closes.length - 1] / closes[closes.length - 1 - days] - 1;
}

/** Retorno anualizado (CAGR) a partir de toda a série. */
export function cagr(closes: number[], periodsPerYear = TRADING_DAYS): number | null {
  if (closes.length < periodsPerYear / 2) return null;
  const years = (closes.length - 1) / periodsPerYear;
  return (closes[closes.length - 1] / closes[0]) ** (1 / years) - 1;
}

export function annualVol(returns: number[], periodsPerYear = TRADING_DAYS): number | null {
  const s = stdev(returns);
  return Number.isFinite(s) ? s * Math.sqrt(periodsPerYear) : null;
}

/** Sharpe simplificado: retorno médio anualizado / volatilidade anual, com taxa livre de risco informada. */
export function sharpe(returns: number[], riskFreeAnnual = 0, periodsPerYear = TRADING_DAYS): number | null {
  const vol = annualVol(returns, periodsPerYear);
  if (!vol) return null;
  return (mean(returns) * periodsPerYear - riskFreeAnnual) / vol;
}

/** Maior queda do topo ao fundo (valor negativo, ex: -0.35 = -35%). */
export function maxDrawdown(closes: number[]): number | null {
  if (closes.length < 2) return null;
  let peak = closes[0];
  let worst = 0;
  for (const c of closes) {
    if (c > peak) peak = c;
    worst = Math.min(worst, c / peak - 1);
  }
  return worst;
}

export function correlation(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n < 10) return null;
  const x = a.slice(-n);
  const y = b.slice(-n);
  const mx = mean(x);
  const my = mean(y);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}

export function beta(asset: number[], bench: number[]): number | null {
  const n = Math.min(asset.length, bench.length);
  if (n < 20) return null;
  const x = bench.slice(-n);
  const y = asset.slice(-n);
  const mx = mean(x);
  const my = mean(y);
  let cov = 0;
  let varx = 0;
  for (let i = 0; i < n; i++) {
    cov += (x[i] - mx) * (y[i] - my);
    varx += (x[i] - mx) ** 2;
  }
  return varx ? cov / varx : null;
}

export interface DatedClose {
  /** dia no formato AAAA-MM-DD */
  day: string;
  close: number;
}

/** Retornos diários de dois ativos só nos dias em que os dois negociaram. */
export function alignedReturns(a: DatedClose[], b: DatedClose[]): [number[], number[]] {
  const mb = new Map(b.map((x) => [x.day, x.close]));
  const pairs = a.filter((x) => mb.has(x.day)).map((x) => [x.close, mb.get(x.day)!] as const);
  const ra: number[] = [];
  const rb: number[] = [];
  for (let i = 1; i < pairs.length; i++) {
    ra.push(pairs[i][0] / pairs[i - 1][0] - 1);
    rb.push(pairs[i][1] / pairs[i - 1][1] - 1);
  }
  return [ra, rb];
}

/** Retorno médio de cada mês do ano (índice 0 = janeiro) a partir de fechamentos diários. */
export function monthlySeasonality(series: DatedClose[]): { avg: (number | null)[]; positive: (number | null)[]; years: number } {
  const lastByMonth = new Map<string, number>();
  for (const p of series) lastByMonth.set(p.day.slice(0, 7), p.close);
  const months = [...lastByMonth.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const buckets: number[][] = Array.from({ length: 12 }, () => []);
  for (let i = 1; i < months.length; i++) {
    const m = Number(months[i][0].slice(5, 7)) - 1;
    buckets[m].push(months[i][1] / months[i - 1][1] - 1);
  }
  return {
    avg: buckets.map((b) => (b.length ? mean(b) : null)),
    positive: buckets.map((b) => (b.length ? b.filter((x) => x > 0).length / b.length : null)),
    years: Math.round(months.length / 12),
  };
}

export interface OutcomeBucket {
  key: string;
  label: string;
  n: number;
  mean: number;
  median: number;
  /** fração de resultados positivos */
  winRate: number;
}

function bucketOf(key: string, label: string, xs: number[]): OutcomeBucket {
  return { key, label, n: xs.length, mean: mean(xs), median: median(xs), winRate: xs.length ? xs.filter((x) => x > 0).length / xs.length : NaN };
}

export type RsiZone = "<30" | "30-45" | "45-55" | "55-70" | ">70";
export const RSI_ZONES: RsiZone[] = ["<30", "30-45", "45-55", "55-70", ">70"];

export function rsiZone(r: number): RsiZone {
  return r < 30 ? "<30" : r < 45 ? "30-45" : r < 55 ? "45-55" : r <= 70 ? "55-70" : ">70";
}

/**
 * Para cada pregão (a partir do 200º), classifica a tendência e a zona de RSI daquele dia
 * e mede o retorno dos `horizon` pregões seguintes. Devolve as amostras por grupo.
 */
export function signalForwardReturns(closes: number[], horizon = 20) {
  const ma9 = smaSeries(closes, 9);
  const ma21 = smaSeries(closes, 21);
  const ma200 = smaSeries(closes, 200);
  const rsi = rsiSeries(closes, 14);
  const byTrend = new Map<Trend, number[]>();
  const byRsi = new Map<RsiZone, number[]>();
  const all: number[] = [];
  for (let i = 200; i + horizon < closes.length; i++) {
    const fwd = closes[i + horizon] / closes[i] - 1;
    all.push(fwd);
    const t = trendOf({ price: closes[i], ma9: ma9[i], ma21: ma21[i], ma200: ma200[i] });
    if (!byTrend.has(t)) byTrend.set(t, []);
    byTrend.get(t)!.push(fwd);
    const r = rsi[i];
    if (r !== null) {
      const z = rsiZone(r);
      if (!byRsi.has(z)) byRsi.set(z, []);
      byRsi.get(z)!.push(fwd);
    }
  }
  return { byTrend, byRsi, all };
}

export function summarize<K extends string>(groups: Map<K, number[]>, order: K[], labels: Record<K, string>): OutcomeBucket[] {
  return order.filter((k) => groups.get(k)?.length).map((k) => bucketOf(k, labels[k], groups.get(k)!));
}

export function summarizeAll(xs: number[]): OutcomeBucket {
  return bucketOf("todos", "Todos os dias", xs);
}

/* ------------------------------ Calibração ------------------------------ */

export interface CalibrationSample {
  /** preço (probabilidade implícita) antes do fim, 0–1 */
  p: number;
  /** 1 se o resultado aconteceu, 0 se não */
  y: 0 | 1;
  category: string;
}

export interface CalibrationBucket {
  lo: number;
  hi: number;
  label: string;
  n: number;
  /** preço médio pago */
  avgPrice: number;
  /** frequência real de acerto */
  hitRate: number;
  /** diferença em pontos: acerto real - preço */
  edgePts: number;
  /** retorno médio de comprar a $1 por ação nesse preço e segurar até o fim (sem taxas) */
  roi: number;
  /** intervalo de confiança de 95% (Wilson) da frequência de acerto */
  ciLow: number;
  ciHigh: number;
}

export const CALIBRATION_EDGES = [0, 0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95, 1.0001];

export function calibrate(samples: CalibrationSample[], edges = CALIBRATION_EDGES): CalibrationBucket[] {
  const out: CalibrationBucket[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const lo = edges[i];
    const hi = edges[i + 1];
    const s = samples.filter((x) => x.p >= lo && x.p < hi);
    if (!s.length) continue;
    const avgPrice = mean(s.map((x) => x.p));
    const hitRate = mean(s.map((x) => x.y));
    const roi = mean(s.map((x) => (x.p > 0 ? x.y / x.p - 1 : 0)));
    out.push({
      lo,
      hi: Math.min(hi, 1),
      label: `${Math.round(lo * 100)}–${Math.round(Math.min(hi, 1) * 100)}%`,
      n: s.length,
      avgPrice,
      hitRate,
      edgePts: (hitRate - avgPrice) * 100,
      roi,
      ...wilson(s.filter((x) => x.y === 1).length, s.length),
    });
  }
  return out;
}

/** Brier score: erro quadrático médio da probabilidade (0 = perfeito, 0.25 = chute de 50%). */
export function brier(samples: CalibrationSample[]): number {
  return mean(samples.map((s) => (s.p - s.y) ** 2));
}

/** Intervalo de confiança de 95% (Wilson) para uma proporção k/n. */
export function wilson(k: number, n: number, z = 1.96): { ciLow: number; ciHigh: number } {
  if (n === 0) return { ciLow: 0, ciHigh: 1 };
  const p = k / n;
  const den = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / den;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / den;
  return { ciLow: Math.max(0, center - half), ciHigh: Math.min(1, center + half) };
}
