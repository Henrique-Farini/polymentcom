import "server-only";
import { fetchChart } from "@/lib/bolsa/server";
import type { BolsaMarket } from "@/lib/bolsa/types";
import { DEFAULT_UNIVERSE, displaySymbol, guessMarket } from "@/lib/bolsa/universe";
import { cached } from "@/lib/server/cache";
import { mapLimit } from "@/lib/server/net";
import {
  alignedReturns,
  beta,
  cagr,
  correlation,
  maxDrawdown,
  mean,
  median,
  monthlySeasonality,
  periodReturn,
  RSI_ZONES,
  signalForwardReturns,
  simpleReturns,
  summarize,
  summarizeAll,
  TRADING_DAYS,
  annualVol,
  type DatedClose,
  type RsiZone,
} from "@/lib/stats";
import type { Trend } from "@/lib/bolsa/trend";
import type { AssetStats, BolsaAnalysis, GroupStats } from "./types";

const HORIZON = 20;
const TREND_ORDER: Trend[] = ["alta-forte", "alta", "lateral", "baixa", "baixa-forte"];
const TREND_LABELS: Record<Trend, string> = {
  "alta-forte": "▲▲ Alta forte",
  alta: "▲ Alta",
  lateral: "◆ Lateral",
  baixa: "▼ Baixa",
  "baixa-forte": "▼▼ Baixa forte",
};
const RSI_LABELS: Record<RsiZone, string> = {
  "<30": "RSI abaixo de 30 (sobrevendido)",
  "30-45": "RSI 30–45",
  "45-55": "RSI 45–55",
  "55-70": "RSI 55–70",
  ">70": "RSI acima de 70 (sobrecomprado)",
};

interface History {
  symbol: string;
  name: string;
  market: BolsaMarket;
  series: DatedClose[];
}

const day = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);

async function history(symbol: string): Promise<History> {
  const r = await cached(`analise:hist:adj:${symbol}`, 60 * 60_000, async () => {
    const { meta, candles } = await fetchChart(symbol, "5y", "1d", { adjusted: true });
    const known = DEFAULT_UNIVERSE.find((u) => u.symbol === symbol);
    const series = candles.map((c) => ({ day: day(c.time), close: c.close }));
    // O último candle diário pode estar atrasado; usa o preço atual.
    if (series.length && meta.regularMarketPrice) series[series.length - 1].close = meta.regularMarketPrice;
    return {
      symbol,
      name: known?.name ?? meta.longName ?? meta.shortName ?? symbol,
      market: known?.market ?? guessMarket(symbol),
      series,
    };
  });
  return r.value;
}

function benchmarkFor(h: History): string | null {
  if (h.symbol === "^BVSP" || h.symbol === "^GSPC") return null;
  return h.market === "B3" || h.symbol === "BRL=X" ? "^BVSP" : "^GSPC";
}

function assetStats(h: History, benches: Map<string, History>): AssetStats {
  const closes = h.series.map((p) => p.close);
  const last1y = closes.slice(-(TRADING_DAYS + 1));
  const r1y = simpleReturns(last1y);
  const vol1y = annualVol(r1y);
  const benchSym = benchmarkFor(h);
  const bench = benchSym ? benches.get(benchSym) : undefined;
  let beta1y: number | null = null;
  if (bench) {
    const [ra, rb] = alignedReturns(h.series.slice(-(TRADING_DAYS + 1)), bench.series.slice(-(TRADING_DAYS + 30)));
    beta1y = beta(ra, rb);
  }
  const season = monthlySeasonality(h.series);
  const high = last1y.length ? Math.max(...last1y) : null;
  return {
    symbol: h.symbol,
    display: displaySymbol(h.symbol),
    name: h.name,
    market: h.market,
    price: closes[closes.length - 1],
    ret1m: periodReturn(closes, 21),
    ret3m: periodReturn(closes, 63),
    ret6m: periodReturn(closes, 126),
    ret1y: periodReturn(closes, TRADING_DAYS),
    cagr: cagr(closes),
    years: Math.round(((closes.length - 1) / TRADING_DAYS) * 10) / 10,
    vol1y,
    retRisk1y: vol1y ? (mean(r1y) * TRADING_DAYS) / vol1y : null,
    mdd1y: maxDrawdown(last1y),
    mdd5y: maxDrawdown(closes),
    upDays1y: r1y.length ? r1y.filter((x) => x > 0).length / r1y.length : null,
    beta1y,
    benchmark: bench ? displaySymbol(bench.symbol) : null,
    fromHigh: high ? closes[closes.length - 1] / high - 1 : null,
    seasonality: season.avg,
    seasonalityPositive: season.positive,
  };
}

function groupStats(stats: AssetStats[]): GroupStats[] {
  const markets: BolsaMarket[] = ["B3", "EUA", "Índices", "Cripto/Câmbio"];
  return markets
    .map((market) => {
      const g = stats.filter((s) => s.market === market);
      const vals = (f: (s: AssetStats) => number | null) => g.map(f).filter((x): x is number => x !== null);
      return {
        market,
        n: g.length,
        medRet1y: median(vals((s) => s.ret1y)),
        medVol1y: median(vals((s) => s.vol1y)),
        medRetRisk: median(vals((s) => s.retRisk1y)),
        medMdd1y: median(vals((s) => s.mdd1y)),
        positive1y: vals((s) => s.ret1y).filter((x) => x > 0).length / Math.max(1, vals((s) => s.ret1y).length),
      };
    })
    .filter((g) => g.n > 0);
}

function backtest(histories: History[]) {
  const merge = <K>(target: Map<K, number[]>, src: Map<K, number[]>) => {
    for (const [k, v] of src) target.set(k, [...(target.get(k) ?? []), ...v]);
  };
  const trend = new Map<Trend, number[]>();
  const rsi = new Map<RsiZone, number[]>();
  const all: number[] = [];
  const perMarket = new Map<BolsaMarket, { trend: Map<Trend, number[]>; all: number[] }>();
  let maxYears = 0;
  for (const h of histories) {
    if (h.market !== "B3" && h.market !== "EUA") continue;
    const closes = h.series.map((p) => p.close);
    maxYears = Math.max(maxYears, closes.length / TRADING_DAYS);
    const r = signalForwardReturns(closes, HORIZON);
    merge(trend, r.byTrend);
    merge(rsi, r.byRsi);
    all.push(...r.all);
    const pm = perMarket.get(h.market) ?? { trend: new Map<Trend, number[]>(), all: [] as number[] };
    merge(pm.trend, r.byTrend);
    pm.all.push(...r.all);
    perMarket.set(h.market, pm);
  }
  return {
    horizon: HORIZON,
    years: Math.round(maxYears * 10) / 10,
    trend: summarize(trend, TREND_ORDER, TREND_LABELS),
    rsi: summarize(rsi, RSI_ZONES, RSI_LABELS),
    baseline: summarizeAll(all),
    byMarket: [...perMarket.entries()].map(([market, v]) => ({
      market,
      trend: summarize(v.trend, TREND_ORDER, TREND_LABELS),
      baseline: summarizeAll(v.all),
    })),
  };
}

export function getBolsaAnalysis(symbols: string[]) {
  const list = (symbols.length ? symbols : DEFAULT_UNIVERSE.map((u) => u.symbol)).slice(0, 120);
  const key = `analise:bolsa:${[...list].sort().join(",")}`;
  return cached(key, 30 * 60_000, async (): Promise<BolsaAnalysis> => {
    const wanted = [...new Set([...list, "^BVSP", "^GSPC"])];
    const results = await mapLimit(wanted, 6, history);
    const all = new Map<string, History>();
    const failed: string[] = [];
    results.forEach((r, i) => {
      if (r.status === "fulfilled" && r.value.series.length > 30) all.set(wanted[i], r.value);
      else if (list.includes(wanted[i])) failed.push(wanted[i]);
    });
    const histories = list.map((s) => all.get(s)).filter((h): h is History => !!h);
    const stats = histories.map((h) => assetStats(h, all));

    // Correlação de 1 ano entre os ativos da lista.
    const symbolsCorr = histories.map((h) => h.symbol);
    const matrix = histories.map((a) =>
      histories.map((b) => {
        if (a === b) return 1;
        const [ra, rb] = alignedReturns(a.series.slice(-(TRADING_DAYS + 1)), b.series.slice(-(TRADING_DAYS + 30)));
        return correlation(ra, rb);
      }),
    );

    return {
      assets: stats,
      groups: groupStats(stats),
      correlation: { symbols: symbolsCorr.map(displaySymbol), matrix },
      backtest: backtest(histories),
      failed,
      at: Date.now(),
    };
  });
}
