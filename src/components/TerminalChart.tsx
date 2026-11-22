"use client";

import {
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
import { bollingerSeries, rsiSeries, smaSeries } from "@/lib/indicators";

const UP = "#22c55e";
const DOWN = "#ef4444";

export interface ChartIndicators {
  ma9: boolean;
  ma21: boolean;
  ma200: boolean;
  boll: boolean;
  volume: boolean;
  rsi: boolean;
}

export const DEFAULT_INDICATORS: ChartIndicators = { ma9: true, ma21: true, ma200: false, boll: false, volume: true, rsi: true };

export const INDICATOR_META: { key: keyof ChartIndicators; label: string; color: string }[] = [
  { key: "ma9", label: "MM9", color: "#f59e0b" },
  { key: "ma21", label: "MM21", color: "#38bdf8" },
  { key: "ma200", label: "MM200", color: "#e879f9" },
  { key: "boll", label: "Bollinger", color: "#94a3b8" },
  { key: "volume", label: "Volume", color: "#64748b" },
  { key: "rsi", label: "RSI", color: "#a78bfa" },
];

interface Refs {
  chart: IChartApi;
  candles: ISeriesApi<"Candlestick">;
  volume: ISeriesApi<"Histogram">;
  ma9: ISeriesApi<"Line">;
  ma21: ISeriesApi<"Line">;
  ma200: ISeriesApi<"Line">;
  bbUp: ISeriesApi<"Line">;
  bbMid: ISeriesApi<"Line">;
  bbLow: ISeriesApi<"Line">;
  rsi: ISeriesApi<"Line"> | null;
}

const t = (c: Candle) => c.time as UTCTimestamp;

function lineData(candles: Candle[], values: (number | null)[]) {
  const out: { time: UTCTimestamp; value: number }[] = [];
  values.forEach((v, i) => {
    if (v !== null) out.push({ time: t(candles[i]), value: v });
  });
  return out;
}

function fade(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

function fmt(n: number | null | undefined, digits = 2) {
  if (n == null || !Number.isFinite(n)) return "–";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function fmtVol(n: number) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(0);
}

/**
 * Gráfico de candles estilo terminal: volume, médias, Bollinger e RSI em painel separado.
 * O gráfico é criado uma vez; novas leituras só trocam os dados. `resetKey` reajusta o zoom.
 */
export function TerminalChart({
  candles,
  resetKey,
  indicators,
  intraday,
  height = 480,
  focus = null,
}: {
  candles: Candle[];
  resetKey: string;
  indicators: ChartIndicators;
  intraday: boolean;
  height?: number;
  /** Indicador em destaque (mouse sobre o botão dele): ele engrossa e o resto escurece. */
  focus?: keyof ChartIndicators | null;
}) {
  const el = useRef<HTMLDivElement>(null);
  const refs = useRef<Refs | null>(null);
  const fittedFor = useRef<string | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const computed = useMemo(() => {
    const closes = candles.map((c) => c.close);
    return {
      ma9: smaSeries(closes, 9),
      ma21: smaSeries(closes, 21),
      ma200: smaSeries(closes, 200),
      bb: bollingerSeries(closes),
      rsi: rsiSeries(closes),
      index: new Map(candles.map((c, i) => [c.time, i])),
    };
  }, [candles]);
  const indexRef = useRef(computed.index);
  indexRef.current = computed.index;

  // Cria o gráfico uma vez.
  useEffect(() => {
    if (!el.current) return;
    const chart = createChart(el.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#7c8a87",
        fontSize: 11,
        panes: { separatorColor: "#1f2a28", separatorHoverColor: "#2a3836" },
      },
      grid: { vertLines: { color: "#141c1b" }, horzLines: { color: "#141c1b" } },
      rightPriceScale: { borderColor: "#1f2a28" },
      timeScale: { borderColor: "#1f2a28", timeVisible: true, secondsVisible: false, rightOffset: 4 },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "#4b5a57", labelBackgroundColor: "#1f2a28" },
        horzLine: { color: "#4b5a57", labelBackgroundColor: "#1f2a28" },
      },
      localization: { locale: "pt-BR" },
    });
    const line = (color: string, width: 1 | 2 = 1, style: LineStyle = LineStyle.Solid) =>
      chart.addSeries(LineSeries, {
        color,
        lineWidth: width,
        lineStyle: style,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });

    const candlesSeries = chart.addSeries(CandlestickSeries, {
      upColor: UP,
      downColor: DOWN,
      borderUpColor: UP,
      borderDownColor: DOWN,
      wickUpColor: UP,
      wickDownColor: DOWN,
      priceLineColor: "#e6edeb",
      priceLineStyle: LineStyle.Dashed,
    });
    const volume = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "vol", lastValueVisible: false, priceLineVisible: false });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    candlesSeries.priceScale().applyOptions({ scaleMargins: { top: 0.06, bottom: 0.2 } });

    refs.current = {
      chart,
      candles: candlesSeries,
      volume,
      ma9: line("#f59e0b"),
      ma21: line("#38bdf8"),
      ma200: line("#e879f9", 2),
      bbUp: line("#94a3b8", 1, LineStyle.Dotted),
      bbMid: line("#64748b", 1, LineStyle.Dashed),
      bbLow: line("#94a3b8", 1, LineStyle.Dotted),
      rsi: null,
    };

    const onMove = (p: MouseEventParams<Time>) => {
      setHoverIdx(p.time === undefined ? null : indexRef.current.get(p.time as number) ?? null);
    };
    chart.subscribeCrosshairMove(onMove);
    return () => {
      chart.unsubscribeCrosshairMove(onMove);
      chart.remove();
      refs.current = null;
      fittedFor.current = null;
    };
  }, []);

  // Mostra/esconde indicadores. O RSI vive num painel próprio que aparece e some.
  useEffect(() => {
    const r = refs.current;
    if (!r) return;
    r.ma9.applyOptions({ visible: indicators.ma9 });
    r.ma21.applyOptions({ visible: indicators.ma21 });
    r.ma200.applyOptions({ visible: indicators.ma200 });
    for (const s of [r.bbUp, r.bbMid, r.bbLow]) s.applyOptions({ visible: indicators.boll });
    r.volume.applyOptions({ visible: indicators.volume });

    if (indicators.rsi && !r.rsi) {
      const rsi = r.chart.addSeries(
        LineSeries,
        { color: "#a78bfa", lineWidth: 1, priceLineVisible: false, lastValueVisible: true, autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }) },
        1,
      );
      rsi.createPriceLine({ price: 70, color: "rgba(239,68,68,0.6)", lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: false, title: "" });
      rsi.createPriceLine({ price: 30, color: "rgba(34,197,94,0.6)", lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: false, title: "" });
      r.rsi = rsi;
      r.chart.panes()[1]?.setHeight(110);
      rsi.setData(lineData(candles, computed.rsi));
    } else if (!indicators.rsi && r.rsi) {
      r.chart.removeSeries(r.rsi);
      r.rsi = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicators]);

  // Destaque: o indicador sob o mouse fica forte, os outros (e os candles) escurecem.
  useEffect(() => {
    const r = refs.current;
    if (!r) return;
    const dim = (k: keyof ChartIndicators) => !!focus && focus !== k;
    const col = (hex: string, k: keyof ChartIndicators) => (dim(k) ? fade(hex, 0.15) : hex);
    const w = (k: keyof ChartIndicators, base: 1 | 2): 1 | 2 | 3 => (focus === k ? 3 : base);
    r.ma9.applyOptions({ color: col("#f59e0b", "ma9"), lineWidth: w("ma9", 1) });
    r.ma21.applyOptions({ color: col("#38bdf8", "ma21"), lineWidth: w("ma21", 1) });
    r.ma200.applyOptions({ color: col("#e879f9", "ma200"), lineWidth: w("ma200", 2) });
    r.bbUp.applyOptions({ color: col("#94a3b8", "boll"), lineWidth: w("boll", 1) });
    r.bbMid.applyOptions({ color: col("#64748b", "boll") });
    r.bbLow.applyOptions({ color: col("#94a3b8", "boll"), lineWidth: w("boll", 1) });
    r.rsi?.applyOptions({ color: col("#a78bfa", "rsi"), lineWidth: w("rsi", 1) });
    const cUp = focus ? fade(UP, 0.25) : UP;
    const cDown = focus ? fade(DOWN, 0.25) : DOWN;
    r.candles.applyOptions({ upColor: cUp, downColor: cDown, borderUpColor: cUp, borderDownColor: cDown, wickUpColor: cUp, wickDownColor: cDown });
  }, [focus, indicators]);

  // Troca os dados quando chega leitura nova.
  useEffect(() => {
    const r = refs.current;
    if (!r) return;
    r.candles.setData(candles.map((c) => ({ time: t(c), open: c.open, high: c.high, low: c.low, close: c.close })));
    r.volume.setData(
      candles.map((c) => ({ time: t(c), value: c.volume, color: c.close >= c.open ? "rgba(34,197,94,0.32)" : "rgba(239,68,68,0.32)" })),
    );
    r.ma9.setData(lineData(candles, computed.ma9));
    r.ma21.setData(lineData(candles, computed.ma21));
    r.ma200.setData(lineData(candles, computed.ma200));
    r.bbUp.setData(lineData(candles, computed.bb.map((b) => b?.upper ?? null)));
    r.bbMid.setData(lineData(candles, computed.bb.map((b) => b?.mid ?? null)));
    r.bbLow.setData(lineData(candles, computed.bb.map((b) => b?.lower ?? null)));
    r.rsi?.setData(lineData(candles, computed.rsi));
    r.chart.applyOptions({ timeScale: { timeVisible: intraday } });
    if (fittedFor.current !== resetKey && candles.length) {
      r.chart.timeScale().fitContent();
      fittedFor.current = resetKey;
    }
  }, [candles, computed, resetKey, intraday]);

  const i = hoverIdx ?? candles.length - 1;
  const c = candles[i];
  const prev = i > 0 ? candles[i - 1] : null;
  const chg = c && prev ? ((c.close - prev.close) / prev.close) * 100 : null;
  const tone = c && c.close >= c.open ? "text-up" : "text-down";
  const lg = (k: keyof ChartIndicators) => `transition-opacity ${focus && focus !== k ? "opacity-25" : focus === k ? "font-bold" : ""}`;

  return (
    <div className="relative">
      {c && (
        <div className="pointer-events-none absolute top-1 left-2 z-10 space-y-0.5 text-[11px]">
          <div className="num flex flex-wrap gap-x-3">
            <span className="text-muted">
              {new Date(c.time * 1000).toLocaleString("pt-BR", intraday ? { dateStyle: "short", timeStyle: "short" } : { dateStyle: "short" })}
            </span>
            <span>A <b className={tone}>{fmt(c.open)}</b></span>
            <span>M <b className={tone}>{fmt(c.high)}</b></span>
            <span>m <b className={tone}>{fmt(c.low)}</b></span>
            <span>F <b className={tone}>{fmt(c.close)}</b></span>
            {chg !== null && <b className={chg >= 0 ? "text-up" : "text-down"}>{chg >= 0 ? "+" : ""}{chg.toFixed(2)}%</b>}
            {indicators.volume && <span className="text-muted">Vol {fmtVol(c.volume)}</span>}
          </div>
          <div className="num flex flex-wrap gap-x-3">
            {indicators.ma9 && <span className={lg("ma9")} style={{ color: "#f59e0b" }}>MM9 {fmt(computed.ma9[i])}</span>}
            {indicators.ma21 && <span className={lg("ma21")} style={{ color: "#38bdf8" }}>MM21 {fmt(computed.ma21[i])}</span>}
            {indicators.ma200 && <span className={lg("ma200")} style={{ color: "#e879f9" }}>MM200 {fmt(computed.ma200[i])}</span>}
            {indicators.boll && computed.bb[i] && (
              <span className={`text-slate-400 ${lg("boll")}`}>BB {fmt(computed.bb[i]!.lower)} – {fmt(computed.bb[i]!.upper)}</span>
            )}
            {indicators.rsi && <span className={lg("rsi")} style={{ color: "#a78bfa" }}>RSI {fmt(computed.rsi[i], 1)}</span>}
          </div>
        </div>
      )}
      <div ref={el} style={{ height }} />
    </div>
  );
}
