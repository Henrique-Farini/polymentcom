"use client";

import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Candle } from "@/lib/bolsa/types";

const UP = "#22c55e";
const DOWN = "#ef4444";

function baseChart(el: HTMLDivElement, percent = false): IChartApi {
  return createChart(el, {
    autoSize: true,
    layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#7c8a87" },
    grid: { vertLines: { color: "#1a2321" }, horzLines: { color: "#1a2321" } },
    rightPriceScale: { borderColor: "#1f2a28" },
    timeScale: { borderColor: "#1f2a28", timeVisible: true, secondsVisible: false },
    localization: {
      locale: "pt-BR",
      priceFormatter: percent ? (p: number) => `${p.toFixed(1)}%` : undefined,
    },
  });
}

function movingAverage(candles: Candle[], period: number) {
  const out: { time: UTCTimestamp; value: number }[] = [];
  let sum = 0;
  candles.forEach((c, i) => {
    sum += c.close;
    if (i >= period) sum -= candles[i - period].close;
    if (i >= period - 1) out.push({ time: c.time as UTCTimestamp, value: sum / period });
  });
  return out;
}

interface CandleRefs {
  chart: IChartApi;
  candles: ISeriesApi<"Candlestick">;
  volume: ISeriesApi<"Histogram">;
  ma9: ISeriesApi<"Line">;
  ma21: ISeriesApi<"Line">;
}

/**
 * Gráfico de candles com volume e médias 9/21.
 * `resetKey` muda quando o período muda: aí o gráfico reajusta o zoom.
 * Atualizações do mesmo período só trocam os dados, sem mexer no zoom.
 */
export function CandleChart({ candles, resetKey, height = 420 }: { candles: Candle[]; resetKey: string; height?: number }) {
  const el = useRef<HTMLDivElement>(null);
  const refs = useRef<CandleRefs | null>(null);
  const fittedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!el.current) return;
    const chart = baseChart(el.current);
    const series = chart.addSeries(CandlestickSeries, {
      upColor: UP,
      downColor: DOWN,
      borderVisible: false,
      wickUpColor: UP,
      wickDownColor: DOWN,
    });
    const volume = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "vol" });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    const ma9 = chart.addSeries(LineSeries, { color: "#f59e0b", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    const ma21 = chart.addSeries(LineSeries, { color: "#38bdf8", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    refs.current = { chart, candles: series, volume, ma9, ma21 };
    return () => {
      chart.remove();
      refs.current = null;
      fittedFor.current = null;
    };
  }, []);

  useEffect(() => {
    const r = refs.current;
    if (!r) return;
    r.candles.setData(candles.map((c) => ({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close })));
    r.volume.setData(
      candles.map((c) => ({
        time: c.time as UTCTimestamp,
        value: c.volume,
        color: c.close >= c.open ? "rgba(34,197,94,0.35)" : "rgba(239,68,68,0.35)",
      })),
    );
    r.ma9.setData(movingAverage(candles, 9));
    r.ma21.setData(movingAverage(candles, 21));
    if (fittedFor.current !== resetKey && candles.length) {
      r.chart.timeScale().fitContent();
      fittedFor.current = resetKey;
    }
  }, [candles, resetKey]);

  return (
    <div>
      <div ref={el} style={{ height }} />
      <div className="mt-2 flex gap-4 text-xs text-muted">
        <span><span className="text-warn">━</span> Média 9</span>
        <span><span className="text-sky-400">━</span> Média 21</span>
      </div>
    </div>
  );
}

export function ProbabilityChart({ points, resetKey, height = 360 }: { points: { t: number; p: number }[]; resetKey: string; height?: number }) {
  const el = useRef<HTMLDivElement>(null);
  const refs = useRef<{ chart: IChartApi; series: ISeriesApi<"Area"> } | null>(null);
  const fittedFor = useRef<string | null>(null);
  const [hover, setHover] = useState<{ t: number; v: number } | null>(null);

  const data = useMemo(() => {
    const byTime = new Map<number, number>();
    for (const p of points) byTime.set(p.t, p.p);
    return [...byTime.entries()].sort((a, b) => a[0] - b[0]).map(([t, p]) => ({ time: t as UTCTimestamp, value: p * 100 }));
  }, [points]);

  useEffect(() => {
    if (!el.current) return;
    const chart = baseChart(el.current, true);
    chart.applyOptions({ crosshair: { mode: CrosshairMode.Normal } });
    const series = chart.addSeries(AreaSeries, {
      lineColor: "#8b5cf6",
      topColor: "rgba(139,92,246,0.35)",
      bottomColor: "rgba(139,92,246,0.02)",
      lineWidth: 2,
      autoscaleInfoProvider: (base: () => { priceRange: { minValue: number; maxValue: number } } | null) => {
        const r = base();
        if (!r) return r;
        return { priceRange: { minValue: Math.max(0, r.priceRange.minValue - 2), maxValue: Math.min(100, r.priceRange.maxValue + 2) } };
      },
    });
    series.createPriceLine({ price: 50, color: "rgba(124,138,135,0.5)", lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: false, title: "50%" });
    const onMove = (p: MouseEventParams<Time>) => {
      const d = p.seriesData.get(series) as { value?: number } | undefined;
      setHover(p.time !== undefined && d?.value !== undefined ? { t: p.time as number, v: d.value } : null);
    };
    chart.subscribeCrosshairMove(onMove);
    refs.current = { chart, series };
    return () => {
      chart.unsubscribeCrosshairMove(onMove);
      chart.remove();
      refs.current = null;
      fittedFor.current = null;
    };
  }, []);

  useEffect(() => {
    const r = refs.current;
    if (!r) return;
    r.series.setData(data);
    if (fittedFor.current !== resetKey && data.length) {
      r.chart.timeScale().fitContent();
      fittedFor.current = resetKey;
    }
  }, [data, resetKey]);

  const shown = hover ?? (data.length ? { t: data[data.length - 1].time as number, v: data[data.length - 1].value } : null);
  const first = data[0]?.value;

  return (
    <div className="relative">
      {shown && (
        <div className="num pointer-events-none absolute top-1 left-2 z-10 flex gap-3 text-[11px]">
          <span className="text-muted">{new Date(shown.t * 1000).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span>
          <b className="text-poly">{shown.v.toFixed(1)}%</b>
          {first !== undefined && (
            <span className={shown.v - first >= 0 ? "text-up" : "text-down"}>
              {shown.v - first >= 0 ? "+" : ""}
              {(shown.v - first).toFixed(1)} pts no período
            </span>
          )}
        </div>
      )}
      <div ref={el} style={{ height }} />
    </div>
  );
}
