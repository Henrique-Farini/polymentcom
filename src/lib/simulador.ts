/**
 * Simulador "fico X dias, saio se cair Y%".
 * Para cada dia do histórico: compra no fechamento, segura até `days` pregões e vende no fechamento.
 * Com stop: se a mínima de algum dia tocar o preço de stop, vende ali. Se o dia já abrir abaixo
 * do stop (queda de uma vez), vende na abertura, que é pior que o stop. Isso mostra a perda real.
 */

export interface Bar {
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface Trade {
  /** Retorno da operação (0.05 = +5%). */
  ret: number;
  stopped: boolean;
  /** Stop disparou com o preço abrindo abaixo dele (saiu pior que o planejado). */
  gapped: boolean;
  /** Pregões até sair. */
  held: number;
}

export function simulateTrade(bars: Bar[], i: number, days: number, stop: number | null): Trade | null {
  if (i + days >= bars.length) return null;
  const entry = bars[i].close;
  if (!(entry > 0)) return null;
  if (stop !== null && stop > 0) {
    const stopPrice = entry * (1 - stop);
    for (let k = 1; k <= days; k++) {
      const b = bars[i + k];
      if (b.open <= stopPrice) return { ret: b.open / entry - 1, stopped: true, gapped: true, held: k };
      if (b.low <= stopPrice) return { ret: -stop, stopped: true, gapped: false, held: k };
    }
  }
  return { ret: bars[i + days].close / entry - 1, stopped: false, gapped: false, held: days };
}

export function simulateAll(bars: Bar[], days: number, stop: number | null): Trade[] {
  const out: Trade[] = [];
  for (let i = 0; i + days < bars.length; i++) {
    const t = simulateTrade(bars, i, days, stop);
    if (t) out.push(t);
  }
  return out;
}

const quantile = (sorted: number[], q: number) => {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
};

export interface HistBin {
  lo: number;
  hi: number;
  n: number;
}

export interface SimSummary {
  n: number;
  winRate: number;
  mean: number;
  median: number;
  /** 10% piores resultados ficaram abaixo disto. */
  p10: number;
  /** 10% melhores resultados ficaram acima disto. */
  p90: number;
  worst: number;
  best: number;
  stopRate: number;
  gapRate: number;
  avgHeld: number;
  hist: HistBin[];
}

export function summarizeTrades(trades: Trade[], bins = 16): SimSummary {
  const rets = trades.map((t) => t.ret).sort((a, b) => a - b);
  const n = rets.length;
  if (!n) {
    return { n: 0, winRate: 0, mean: 0, median: 0, p10: 0, p90: 0, worst: 0, best: 0, stopRate: 0, gapRate: 0, avgHeld: 0, hist: [] };
  }
  const lo = quantile(rets, 0.02);
  const hi = quantile(rets, 0.98);
  const width = (hi - lo) / bins || 0.01;
  const hist: HistBin[] = Array.from({ length: bins }, (_, k) => ({ lo: lo + k * width, hi: lo + (k + 1) * width, n: 0 }));
  for (const r of rets) {
    const k = Math.min(bins - 1, Math.max(0, Math.floor((r - lo) / width)));
    hist[k].n++;
  }
  return {
    n,
    winRate: rets.filter((r) => r > 0).length / n,
    mean: rets.reduce((s, r) => s + r, 0) / n,
    median: quantile(rets, 0.5),
    p10: quantile(rets, 0.1),
    p90: quantile(rets, 0.9),
    worst: rets[0],
    best: rets[n - 1],
    stopRate: trades.filter((t) => t.stopped).length / n,
    gapRate: trades.filter((t) => t.gapped).length / n,
    avgHeld: trades.reduce((s, t) => s + t.held, 0) / n,
    hist,
  };
}

export const SIM_DAYS = [5, 10, 20, 60, 120] as const;
export const SIM_STOPS = [null, 0.03, 0.05, 0.08, 0.1, 0.15, 0.2] as const;

export const DAYS_LABEL: Record<number, string> = {
  5: "1 semana",
  10: "2 semanas",
  20: "1 mês",
  60: "3 meses",
  120: "6 meses",
};

export interface GridCell {
  days: number;
  stop: number | null;
  mean: number;
  median: number;
  winRate: number;
  p10: number;
  stopRate: number;
  n: number;
}

/** Todas as combinações de prazo × stop, para achar a que funcionou melhor no histórico. */
export function simGrid(bars: Bar[]): GridCell[] {
  const out: GridCell[] = [];
  for (const days of SIM_DAYS) {
    for (const stop of SIM_STOPS) {
      const s = summarizeTrades(simulateAll(bars, days, stop), 1);
      if (!s.n) continue;
      out.push({ days, stop, mean: s.mean, median: s.median, winRate: s.winRate, p10: s.p10, stopRate: s.stopRate, n: s.n });
    }
  }
  return out;
}
