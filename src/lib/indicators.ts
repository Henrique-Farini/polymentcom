/** Indicadores técnicos. Funções puras: recebem séries e devolvem números. */

export function sma(values: number[], period: number): number | null {
  if (values.length < period || period <= 0) return null;
  let sum = 0;
  for (let i = values.length - period; i < values.length; i++) sum += values[i];
  return sum / period;
}

export function emaSeries(values: number[], period: number): number[] {
  if (values.length < period) return [];
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out.push(prev);
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

/** RSI de Wilder. 0–100. */
export function rsi(closes: number[], period = 14): number | null {
  if (closes.length <= period) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/** Histograma do MACD (12, 26, 9): valor atual e anterior. */
export function macdHistogram(
  closes: number[],
  fast = 12,
  slow = 26,
  signal = 9,
): { hist: number; prev: number } | null {
  const emaFast = emaSeries(closes, fast);
  const emaSlow = emaSeries(closes, slow);
  if (emaSlow.length === 0) return null;
  const offset = emaFast.length - emaSlow.length;
  const macdLine = emaSlow.map((s, i) => emaFast[i + offset] - s);
  const signalLine = emaSeries(macdLine, signal);
  if (signalLine.length < 2) return null;
  const off2 = macdLine.length - signalLine.length;
  const last = signalLine.length - 1;
  return {
    hist: macdLine[last + off2] - signalLine[last],
    prev: macdLine[last - 1 + off2] - signalLine[last - 1],
  };
}

/** %B das Bandas de Bollinger: 0 = banda de baixo, 1 = banda de cima. */
export function bollingerPercentB(closes: number[], period = 20, mult = 2): number | null {
  const mid = sma(closes, period);
  if (mid === null) return null;
  const window = closes.slice(-period);
  const variance = window.reduce((acc, v) => acc + (v - mid) ** 2, 0) / period;
  const sd = Math.sqrt(variance);
  if (sd === 0) return 0.5;
  const upper = mid + mult * sd;
  const lower = mid - mult * sd;
  return (closes[closes.length - 1] - lower) / (upper - lower);
}

/** ATR (média do range verdadeiro) como % do preço atual. */
export function atrPercent(highs: number[], lows: number[], closes: number[], period = 14): number | null {
  const n = closes.length;
  if (n <= period || highs.length !== n || lows.length !== n) return null;
  const trs: number[] = [];
  for (let i = 1; i < n; i++) {
    trs.push(
      Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])),
    );
  }
  let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trs.length; i++) atr = (atr * (period - 1) + trs[i]) / period;
  const price = closes[n - 1];
  return price > 0 ? (atr / price) * 100 : null;
}

export const clamp01 = (x: number) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);

/** Série de médias móveis simples alinhada com `values` (null onde não há dados suficientes). */
export function smaSeries(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  values.forEach((v, i) => {
    sum += v;
    if (i >= period) sum -= values[i - period];
    out.push(i >= period - 1 ? sum / period : null);
  });
  return out;
}

/** Série de RSI de Wilder alinhada com `closes`. */
export function rsiSeries(closes: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = closes.map(() => null);
  if (closes.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  const value = () => (avgLoss === 0 ? (avgGain === 0 ? 50 : 100) : 100 - 100 / (1 + avgGain / avgLoss));
  out[period] = value();
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = value();
  }
  return out;
}

/** Bandas de Bollinger alinhadas com `closes`. */
export function bollingerSeries(closes: number[], period = 20, mult = 2) {
  return closes.map((_, i) => {
    if (i < period - 1) return null;
    const w = closes.slice(i - period + 1, i + 1);
    const mid = w.reduce((a, b) => a + b, 0) / period;
    const sd = Math.sqrt(w.reduce((a, v) => a + (v - mid) ** 2, 0) / period);
    return { upper: mid + mult * sd, mid, lower: mid - mult * sd };
  });
}
