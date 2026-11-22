"use client";

import { useState } from "react";
import type { AssetStats } from "@/lib/analise/types";
import type { BolsaMarket } from "@/lib/bolsa/types";
import type { CalibrationBucket, OutcomeBucket } from "@/lib/stats";

/* Cores de identidade dos grupos (paleta categórica validada para fundo escuro). */
export const MARKET_COLOR: Record<BolsaMarket, string> = {
  B3: "#3987e5",
  EUA: "#d95926",
  Índices: "#199e70",
  "Cripto/Câmbio": "#c98500",
};

export const pct = (x: number | null | undefined, d = 1, sign = true) =>
  x == null || !Number.isFinite(x) ? "–" : `${sign && x > 0 ? "+" : ""}${(x * 100).toFixed(d)}%`;

/** Fundo divergente para células: verde para positivo, vermelho para negativo, cinza no zero. */
export function divergingBg(x: number | null | undefined, scale: number, pos = "34,197,94", neg = "239,68,68") {
  if (x == null || !Number.isFinite(x)) return "transparent";
  const k = Math.min(1, Math.abs(x) / scale);
  if (k < 0.04) return "rgba(56,56,53,0.6)";
  return `rgba(${x > 0 ? pos : neg},${0.12 + k * 0.6})`;
}

function Tooltip({ x, y, children }: { x: number; y: number; children: React.ReactNode }) {
  return (
    <div
      className="pointer-events-none absolute z-20 rounded-md border border-line bg-bg/95 px-2.5 py-1.5 text-[11px] shadow-lg"
      style={{ left: x + 12, top: y + 12 }}
    >
      {children}
    </div>
  );
}

/* ------------------------- Risco × Retorno ------------------------- */

export function RiskReturnScatter({
  assets,
  focus = null,
  onFocus,
  focusMarket = null,
  onFocusMarket,
}: {
  assets: AssetStats[];
  /** Ativo destacado por fora (ex: linha da tabela sob o mouse). */
  focus?: string | null;
  onFocus?: (symbol: string | null) => void;
  focusMarket?: BolsaMarket | null;
  onFocusMarket?: (m: BolsaMarket | null) => void;
}) {
  const [hover, setHover] = useState<{ a: AssetStats; x: number; y: number } | null>(null);
  const [legendHover, setLegendHover] = useState<BolsaMarket | null>(null);
  const activeSym = hover?.a.symbol ?? focus;
  const activeMkt = legendHover ?? focusMarket;
  const isDim = (a: AssetStats) => (activeSym ? a.symbol !== activeSym : activeMkt ? a.market !== activeMkt : false);
  const pts = assets.filter((a) => a.vol1y !== null && a.ret1y !== null);
  if (!pts.length) return null;
  const W = 720;
  const H = 400;
  const pad = { l: 52, r: 16, t: 16, b: 40 };
  const vols = pts.map((a) => a.vol1y!);
  const rets = pts.map((a) => a.ret1y!);
  const xMax = Math.max(...vols) * 1.08;
  const yMin = Math.min(0, ...rets) * 1.1 - 0.02;
  const yMax = Math.max(0, ...rets) * 1.1 + 0.02;
  const sx = (v: number) => pad.l + (v / xMax) * (W - pad.l - pad.r);
  const sy = (v: number) => pad.t + ((yMax - v) / (yMax - yMin)) * (H - pad.t - pad.b);
  const medVol = [...vols].sort((a, b) => a - b)[Math.floor(vols.length / 2)];
  const yTicks = niceTicks(yMin, yMax, 6);
  const xTicks = niceTicks(0, xMax, 6);
  const markets = [...new Set(pts.map((a) => a.market))];

  return (
    <div className="relative">
      <div className="mb-2 flex flex-wrap gap-3 text-[11px] text-muted">
        {markets.map((m) => (
          <span
            key={m}
            className={`focus-item inline-flex cursor-default items-center gap-1.5 ${activeMkt && activeMkt !== m ? "dimmed" : ""}`}
            onMouseEnter={() => {
              setLegendHover(m);
              onFocusMarket?.(m);
            }}
            onMouseLeave={() => {
              setLegendHover(null);
              onFocusMarket?.(null);
            }}
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: MARKET_COLOR[m] }} />
            {m}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Gráfico de risco (volatilidade) por retorno em 1 ano">
        {/* quadrantes */}
        <rect x={pad.l} y={pad.t} width={sx(medVol) - pad.l} height={sy(0) - pad.t} fill="rgba(34,197,94,0.06)" />
        <rect x={sx(medVol)} y={sy(0)} width={W - pad.r - sx(medVol)} height={H - pad.b - sy(0)} fill="rgba(239,68,68,0.06)" />
        <text x={pad.l + 6} y={pad.t + 14} fontSize="10" fill="#22c55e">Retorno maior com risco menor</text>
        <text x={W - pad.r - 6} y={H - pad.b - 6} fontSize="10" fill="#ef4444" textAnchor="end">Retorno menor com risco maior</text>
        {yTicks.map((t) => (
          <g key={`y${t}`}>
            <line x1={pad.l} x2={W - pad.r} y1={sy(t)} y2={sy(t)} stroke={t === 0 ? "#4b5a57" : "#1a2321"} strokeWidth={t === 0 ? 1.5 : 1} />
            <text x={pad.l - 6} y={sy(t) + 3} fontSize="10" fill="#7c8a87" textAnchor="end">{pct(t, 0)}</text>
          </g>
        ))}
        {xTicks.map((t) => (
          <g key={`x${t}`}>
            <line x1={sx(t)} x2={sx(t)} y1={pad.t} y2={H - pad.b} stroke="#1a2321" />
            <text x={sx(t)} y={H - pad.b + 14} fontSize="10" fill="#7c8a87" textAnchor="middle">{pct(t, 0, false)}</text>
          </g>
        ))}
        <line x1={sx(medVol)} x2={sx(medVol)} y1={pad.t} y2={H - pad.b} stroke="#4b5a57" strokeDasharray="4 4" />
        <text x={sx(medVol) + 4} y={H - pad.b - 6} fontSize="9" fill="#7c8a87">risco mediano</text>
        <text x={(W + pad.l) / 2} y={H - 6} fontSize="10" fill="#7c8a87" textAnchor="middle">Volatilidade anual (risco) →</text>
        <text x={12} y={(H - pad.b) / 2} fontSize="10" fill="#7c8a87" textAnchor="middle" transform={`rotate(-90 12 ${(H - pad.b) / 2})`}>Retorno 12 meses →</text>
        {pts.map((a) => (
          <g
            key={a.symbol}
            className={`focus-item ${isDim(a) ? "dimmed" : ""}`}
            onMouseEnter={(e) => {
              setHover({ a, x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY });
              onFocus?.(a.symbol);
            }}
            onMouseLeave={() => {
              setHover(null);
              onFocus?.(null);
            }}
          >
            <circle cx={sx(a.vol1y!)} cy={sy(a.ret1y!)} r={14} fill="transparent" />
            <circle
              cx={sx(a.vol1y!)}
              cy={sy(a.ret1y!)}
              r={activeSym === a.symbol ? 8 : 5}
              fill={MARKET_COLOR[a.market]}
              stroke={activeSym === a.symbol ? "#e6edeb" : "#111716"}
              strokeWidth={2}
            />
            <text
              x={sx(a.vol1y!) + (activeSym === a.symbol ? 10 : 7)}
              y={sy(a.ret1y!) - 6}
              fontSize={activeSym === a.symbol ? 12 : 10}
              fontWeight={activeSym === a.symbol ? 700 : 400}
              fill="#c9d3d1"
            >
              {a.display}
            </text>
          </g>
        ))}
      </svg>
      {hover && (
        <Tooltip x={hover.x} y={hover.y}>
          <div className="font-semibold">{hover.a.display} · {hover.a.name}</div>
          <div className="num text-muted">Retorno 12m <span className="text-text">{pct(hover.a.ret1y)}</span></div>
          <div className="num text-muted">Volatilidade <span className="text-text">{pct(hover.a.vol1y, 1, false)}</span></div>
          <div className="num text-muted">Retorno ÷ risco <span className="text-text">{hover.a.retRisk1y?.toFixed(2) ?? "–"}</span></div>
        </Tooltip>
      )}
    </div>
  );
}

function niceTicks(min: number, max: number, count: number): number[] {
  const span = max - min || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Math.round(v / step) * step);
  return out;
}

/* ------------------------- Barras de retorno seguinte ------------------------- */

export function ForwardBars({ buckets, baseline, horizon }: { buckets: OutcomeBucket[]; baseline: OutcomeBucket; horizon: number }) {
  const max = Math.max(...buckets.map((b) => Math.abs(b.mean)), Math.abs(baseline.mean)) * 1.15 || 0.01;
  const pos = (v: number) => 50 + (v / max) * 50;
  return (
    <div>
      <div className="mb-1 grid grid-cols-[minmax(8rem,12rem)_1fr_4.5rem_4rem] gap-2 text-[10px] uppercase tracking-wider text-muted">
        <span>Sinal no dia</span>
        <span className="text-center">Retorno médio em {horizon} pregões</span>
        <span className="text-right">Positivos</span>
        <span className="text-right">Casos</span>
      </div>
      <ul className="focus-group space-y-1.5">
        {buckets.map((b) => {
          const better = b.mean > baseline.mean;
          return (
            <li key={b.key} className="focus-item grid grid-cols-[minmax(8rem,12rem)_1fr_4.5rem_4rem] items-center gap-2 text-xs" title={`Mediana ${pct(b.median, 2)}`}>
              <span className="truncate">{b.label}</span>
              <div className="relative h-5 rounded bg-card2">
                <div className="absolute inset-y-0 w-px bg-muted/60" style={{ left: "50%" }} />
                <div className="absolute inset-y-0 w-0.5 bg-warn" style={{ left: `${pos(baseline.mean)}%` }} title="Média de todos os dias" />
                <div
                  className={`absolute inset-y-1 rounded-sm ${b.mean >= 0 ? "bg-up" : "bg-down"}`}
                  style={{ left: `${Math.min(50, pos(b.mean))}%`, width: `${Math.abs(pos(b.mean) - 50)}%` }}
                />
                <span className={`num absolute top-0.5 text-[11px] font-semibold ${b.mean >= 0 ? "left-[52%]" : "right-[52%]"}`}>
                  {pct(b.mean, 2)} {better ? "▲" : "▼"}
                </span>
              </div>
              <span className="num text-right">{pct(b.winRate, 0, false)}</span>
              <span className="num text-right text-muted">{b.n.toLocaleString("pt-BR")}</span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[11px] text-muted">
        <span className="mr-1 inline-block h-2.5 w-0.5 bg-warn align-middle" /> linha laranja = média de todos os dias ({pct(baseline.mean, 2)}, {pct(baseline.winRate, 0, false)} positivos). ▲ acima da média, ▼ abaixo.
      </p>
    </div>
  );
}

/* ------------------------- Calibração do Polymarket ------------------------- */

export function CalibrationChart({ buckets }: { buckets: CalibrationBucket[] }) {
  const [hover, setHover] = useState<{ b: CalibrationBucket; x: number; y: number } | null>(null);
  const W = 520;
  const H = 420;
  const pad = { l: 48, r: 16, t: 16, b: 44 };
  const s = (v: number, axis: "x" | "y") =>
    axis === "x" ? pad.l + v * (W - pad.l - pad.r) : pad.t + (1 - v) * (H - pad.t - pad.b);
  const ticks = [0, 0.2, 0.4, 0.6, 0.8, 1];
  const maxN = Math.max(...buckets.map((b) => b.n));
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Calibração: preço pago contra frequência real de acerto">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={s(0, "x")} x2={s(1, "x")} y1={s(t, "y")} y2={s(t, "y")} stroke="#1a2321" />
            <line x1={s(t, "x")} x2={s(t, "x")} y1={s(0, "y")} y2={s(1, "y")} stroke="#1a2321" />
            <text x={pad.l - 6} y={s(t, "y") + 3} fontSize="10" fill="#7c8a87" textAnchor="end">{t * 100}%</text>
            <text x={s(t, "x")} y={H - pad.b + 14} fontSize="10" fill="#7c8a87" textAnchor="middle">{t * 100}%</text>
          </g>
        ))}
        <line x1={s(0, "x")} y1={s(0, "y")} x2={s(1, "x")} y2={s(1, "y")} stroke="#7c8a87" strokeDasharray="5 4" />
        <text x={s(0.62, "x")} y={s(0.56, "y")} fontSize="10" fill="#7c8a87" transform={`rotate(-39 ${s(0.62, "x")} ${s(0.56, "y")})`}>
          preço = acerto (justo)
        </text>
        <text x={s(0.04, "x")} y={s(0.93, "y")} fontSize="10" fill="#22c55e">acima da linha: acertou mais que o preço (barato)</text>
        <text x={s(0.96, "x")} y={s(0.05, "y")} fontSize="10" fill="#ef4444" textAnchor="end">abaixo: acertou menos que o preço (caro)</text>
        <text x={(W + pad.l) / 2} y={H - 8} fontSize="10" fill="#7c8a87" textAnchor="middle">Preço pago 24h antes de encerrar (probabilidade implícita) →</text>
        <text x={12} y={(H - pad.b) / 2} fontSize="10" fill="#7c8a87" textAnchor="middle" transform={`rotate(-90 12 ${(H - pad.b) / 2})`}>Frequência real de acerto →</text>
        {buckets.map((b) => {
          const cx = s(b.avgPrice, "x");
          const cy = s(b.hitRate, "y");
          const r = 4 + (b.n / maxN) * 6;
          return (
            <g
              key={b.label}
              className={`focus-item ${hover && hover.b !== b ? "dimmed" : ""}`}
              onMouseEnter={(e) => setHover({ b, x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY })}
              onMouseLeave={() => setHover(null)}
            >
              <line x1={cx} x2={cx} y1={s(b.ciLow, "y")} y2={s(b.ciHigh, "y")} stroke="#8b5cf6" strokeOpacity={0.55} strokeWidth={2} />
              <circle cx={cx} cy={cy} r={16} fill="transparent" />
              <circle cx={cx} cy={cy} r={r} fill="#8b5cf6" stroke="#111716" strokeWidth={2} />
            </g>
          );
        })}
      </svg>
      <p className="text-[11px] text-muted">Bolinha maior = mais casos. Barra vertical = margem de erro (95%).</p>
      {hover && (
        <Tooltip x={hover.x} y={hover.y}>
          <div className="font-semibold">Faixa {hover.b.label}</div>
          <div className="num text-muted">Preço médio <span className="text-text">{pct(hover.b.avgPrice, 1, false)}</span></div>
          <div className="num text-muted">Acertou <span className="text-text">{pct(hover.b.hitRate, 1, false)}</span> ({pct(hover.b.ciLow, 0, false)}–{pct(hover.b.ciHigh, 0, false)})</div>
          <div className="num text-muted">Retorno médio <span className="text-text">{pct(hover.b.roi)}</span></div>
          <div className="num text-muted">{hover.b.n} casos</div>
        </Tooltip>
      )}
    </div>
  );
}
