import "server-only";
import { atrPercent, bollingerPercentB, macdHistogram, rsi, sma } from "@/lib/indicators";
import { cached } from "@/lib/server/cache";
import { getJson, mapLimit } from "@/lib/server/net";
import type { BolsaAsset, BolsaAssetDetail, Candle } from "./types";
import { DEFAULT_UNIVERSE, displaySymbol, guessMarket } from "./universe";

const YAHOO = "https://query1.finance.yahoo.com/v8/finance/chart";

interface YahooChart {
  chart: {
    result?: {
      meta: {
        symbol: string;
        currency?: string;
        longName?: string;
        shortName?: string;
        regularMarketPrice?: number;
        regularMarketChangePercent?: number;
        regularMarketTime?: number;
        regularMarketVolume?: number;
        regularMarketDayHigh?: number;
        regularMarketDayLow?: number;
        fiftyTwoWeekHigh?: number;
        fiftyTwoWeekLow?: number;
        previousClose?: number;
      };
      timestamp?: number[];
      indicators: {
        quote: {
          open: (number | null)[];
          high: (number | null)[];
          low: (number | null)[];
          close: (number | null)[];
          volume: (number | null)[];
        }[];
        adjclose?: { adjclose: (number | null)[] }[];
      };
      events?: { dividends?: Record<string, { amount: number; date: number }> };
    }[];
    error?: { description?: string } | null;
  };
}

export interface Dividend {
  /** Data ex (segundos). */
  date: number;
  /** Valor por ação, na moeda do ativo. */
  amount: number;
}

/**
 * Busca os candles no Yahoo.
 * `adjusted: true` devolve preços ajustados por dividendos e desdobramentos (retorno total):
 * quem segurou a ação recebeu os dividendos, então o retorno conta com eles.
 */
export async function fetchChart(symbol: string, range: string, interval: string, opts: { adjusted?: boolean } = {}) {
  const data = await getJson<YahooChart>(
    `${YAHOO}/${encodeURIComponent(symbol)}?${range.startsWith("since:") ? `period1=${range.slice(6)}&period2=${Math.floor(Date.now() / 1000)}` : `range=${range}`}&interval=${interval}&includePrePost=false&events=div%2Csplits`,
  );
  const result = data.chart.result?.[0];
  if (!result) throw new Error(data.chart.error?.description ?? `Sem dados para ${symbol}`);
  const q = result.indicators.quote[0];
  const adj = opts.adjusted ? result.indicators.adjclose?.[0]?.adjclose : undefined;
  const candles: Candle[] = [];
  (result.timestamp ?? []).forEach((t, i) => {
    const c = q.close[i];
    if (c == null) return;
    const k = adj && adj[i] != null && c > 0 ? adj[i]! / c : 1;
    candles.push({
      time: t,
      open: (q.open[i] ?? c) * k,
      high: (q.high[i] ?? c) * k,
      low: (q.low[i] ?? c) * k,
      close: c * k,
      volume: q.volume[i] ?? 0,
    });
  });
  const dividends: Dividend[] = Object.values(result.events?.dividends ?? {})
    .map((d) => ({ date: d.date, amount: d.amount }))
    .sort((a, b) => a.date - b.date);
  return { meta: result.meta, candles, dividends };
}

/** Dividendos recentes de um ativo (para creditar na carteira de teste). */
export async function getDividends(symbol: string) {
  const r = await cached(`bolsa:divs:${symbol}`, 60 * 60_000, async () => (await fetchChart(symbol, "3mo", "1d")).dividends);
  return r.value;
}

export function buildAsset(
  symbol: string,
  meta: NonNullable<YahooChart["chart"]["result"]>[number]["meta"],
  candles: Candle[],
): BolsaAsset {
  const known = DEFAULT_UNIVERSE.find((u) => u.symbol === symbol);
  const closes = candles.map((c) => c.close);
  const price = meta.regularMarketPrice ?? closes[closes.length - 1];
  if (closes.length) closes[closes.length - 1] = price;
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const vols = candles.map((c) => c.volume);

  const prevClose = closes.length >= 2 ? closes[closes.length - 2] : null;
  const changePct =
    meta.regularMarketChangePercent ?? (prevClose ? ((price - prevClose) / prevClose) * 100 : 0);

  const avgVol = sma(vols.slice(0, -1), 20);
  const lastVol = meta.regularMarketVolume ?? vols[vols.length - 1] ?? 0;
  const macd = macdHistogram(closes);

  return {
    symbol,
    display: displaySymbol(symbol),
    name: known?.name ?? meta.longName ?? meta.shortName ?? symbol,
    market: known?.market ?? guessMarket(symbol),
    currency: meta.currency ?? "",
    price,
    changePct,
    changeAbs: prevClose !== null ? price - prevClose : (price * changePct) / (100 + changePct),
    dayOpen: candles.length ? candles[candles.length - 1].open : null,
    dayHigh: meta.regularMarketDayHigh ?? (candles.length ? Math.max(candles[candles.length - 1].high, price) : null),
    dayLow: meta.regularMarketDayLow ?? (candles.length ? Math.min(candles[candles.length - 1].low, price) : null),
    volume: lastVol,
    volRatio: avgVol && avgVol > 0 && lastVol > 0 ? lastVol / avgVol : null,
    ma9: sma(closes, 9),
    ma21: sma(closes, 21),
    ma200: sma(closes, 200),
    rsi14: rsi(closes, 14),
    macdHist: macd?.hist ?? null,
    macdHistPrev: macd?.prev ?? null,
    percentB: bollingerPercentB(closes),
    atrPct: atrPercent(highs, lows, closes),
    high52: meta.fiftyTwoWeekHigh ?? null,
    low52: meta.fiftyTwoWeekLow ?? null,
    spark: closes.slice(-30),
    marketTime: (meta.regularMarketTime ?? 0) * 1000,
  };
}

async function loadAsset(symbol: string): Promise<BolsaAsset> {
  const r = await cached(`bolsa:daily:${symbol}`, 45_000, async () => {
    const { meta, candles } = await fetchChart(symbol, "1y", "1d");
    return buildAsset(symbol, meta, candles);
  });
  return r.value;
}

export async function getAssets(symbols: string[]) {
  const list = symbols.length ? symbols : DEFAULT_UNIVERSE.map((u) => u.symbol);
  const results = await mapLimit(list.slice(0, 60), 8, loadAsset);
  const assets: BolsaAsset[] = [];
  const failed: string[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") assets.push(r.value);
    else failed.push(list[i]);
  });
  return { assets, failed, at: Date.now() };
}

const DETAIL_RANGES: Record<string, { range: string; interval: string; ttl: number }> = {
  "1d": { range: "1d", interval: "5m", ttl: 20_000 },
  "5d": { range: "5d", interval: "15m", ttl: 30_000 },
  "1m": { range: "1mo", interval: "60m", ttl: 60_000 },
  "6m": { range: "6mo", interval: "1d", ttl: 60_000 },
  "1a": { range: "1y", interval: "1d", ttl: 60_000 },
  "5a": { range: "5y", interval: "1wk", ttl: 300_000 },
};

export async function getAssetDetail(symbol: string, rangeKey: string) {
  const key = DETAIL_RANGES[rangeKey] ? rangeKey : "6m";
  const r = DETAIL_RANGES[key];
  return cached(`bolsa:detail:${symbol}:${key}`, r.ttl, async (): Promise<BolsaAssetDetail> => {
    const [asset, chart] = await Promise.all([loadAsset(symbol), fetchChart(symbol, r.range, r.interval)]);
    // O Yahoo às vezes demora para atualizar o candle mais recente; alinha com o preço atual.
    const last = chart.candles[chart.candles.length - 1];
    if (last && asset.marketTime / 1000 >= last.time) {
      last.close = asset.price;
      last.high = Math.max(last.high, asset.price);
      last.low = Math.min(last.low, asset.price);
    }
    return { asset, candles: chart.candles, range: key };
  });
}
