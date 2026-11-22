"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { TREND_META } from "@/lib/bolsa/trend";
import { money } from "@/lib/format";
import { polyTrend } from "@/lib/polymarket/trend";
import type { PolyMarket } from "@/lib/polymarket/types";
import { hoursToEnd } from "@/lib/score/polymarket";
import type { ScoreResult } from "@/lib/score/types";
import { TrendChip } from "./QuoteTable";
import { Flash, ScorePill, Star } from "./ui";

export interface MarketRow {
  m: PolyMarket;
  s: ScoreResult;
}

type SortKey = "score" | "prob" | "c24" | "c1h" | "volume" | "liquidity" | "spread" | "ends" | "trend";

const MAX_ROWS = 200;

function ptsBg(pts: number) {
  const k = Math.min(1, Math.abs(pts) / 10);
  const alpha = 0.12 + k * 0.55;
  return pts >= 0 ? `rgba(34,197,94,${alpha})` : `rgba(239,68,68,${alpha})`;
}

const pts = (v: number | null) => (v === null ? "–" : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}`);

function endsText(h: number | null) {
  if (h === null) return "–";
  if (h < 0) return "encerrado";
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `${Math.round(h)}h`;
  if (h < 24 * 60) return `${Math.round(h / 24)}d`;
  return `${Math.round(h / 24 / 30)} meses`;
}

const COLS: { key: SortKey; label: string; align?: "right"; hide?: string; title?: string }[] = [
  { key: "prob", label: "Prob.", align: "right", title: "Chance do primeiro resultado (Sim)" },
  { key: "c24", label: "24h", align: "right", title: "Variação em pontos de probabilidade nas últimas 24h" },
  { key: "c1h", label: "1h", align: "right", hide: "hidden @3xl:table-cell" },
  { key: "trend", label: "Tendência", hide: "hidden @2xl:table-cell" },
  { key: "volume", label: "Vol 24h", align: "right", hide: "hidden @xl:table-cell" },
  { key: "liquidity", label: "Liquidez", align: "right", hide: "hidden @4xl:table-cell" },
  { key: "spread", label: "Spread", align: "right", hide: "hidden @5xl:table-cell" },
  { key: "ends", label: "Encerra", align: "right", hide: "hidden @4xl:table-cell" },
  { key: "score", label: "Score", align: "right" },
];

export function MarketTable({
  rows,
  selected,
  onSelect,
  starred,
  onStar,
}: {
  rows: MarketRow[];
  selected: string | null;
  onSelect: (id: string) => void;
  starred: (id: string) => boolean;
  onStar: (id: string) => void;
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "score", dir: -1 });
  const wrap = useRef<HTMLDivElement>(null);

  const sorted = useMemo(() => {
    const now = Date.now();
    const val = (r: MarketRow): number => {
      switch (sort.key) {
        case "prob":
          return r.m.probability;
        case "c24":
          return r.m.change24h ?? 0;
        case "c1h":
          return r.m.change1h ?? 0;
        case "volume":
          return r.m.volume24h;
        case "liquidity":
          return r.m.liquidity;
        case "spread":
          return r.m.spread ?? 1;
        case "ends":
          return hoursToEnd(r.m, now) ?? 1e9;
        case "trend":
          return TREND_META[polyTrend(r.m)].rank * 1000 + r.s.score;
        default:
          return r.s.score;
      }
    };
    return [...rows].sort((x, y) => (val(x) - val(y)) * sort.dir).slice(0, MAX_ROWS);
  }, [rows, sort]);

  useEffect(() => {
    wrap.current?.querySelector<HTMLElement>('[data-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  function onKey(e: React.KeyboardEvent) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const i = sorted.findIndex((r) => r.m.id === selected);
    const next = sorted[Math.max(0, Math.min(sorted.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))];
    if (next) onSelect(next.m.id);
  }

  const now = Date.now();

  return (
    <div ref={wrap} tabIndex={0} onKeyDown={onKey} className="@container max-h-[640px] overflow-auto outline-none" aria-label="Tabela de mercados. Use as setas para navegar.">
      <table className="w-full border-collapse text-xs">
        <thead className="sticky top-0 z-10 bg-card2 text-[10px] uppercase tracking-wider text-muted">
          <tr>
            <th className="w-6 px-2 py-2" />
            <th className="w-full px-2 py-2 text-left font-medium">Mercado</th>
            {COLS.map((c) => (
              <th key={c.key} className={`px-2 py-2 font-medium ${c.align === "right" ? "text-right" : "text-left"} ${c.hide ?? ""}`} title={c.title}>
                <button
                  type="button"
                  onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? (s.dir === 1 ? -1 : 1) : c.key === "spread" || c.key === "ends" ? 1 : -1 }))}
                  className={`inline-flex items-center gap-1 hover:text-text ${sort.key === c.key ? "text-text" : ""}`}
                >
                  {c.label}
                  {sort.key === c.key && <span aria-hidden>{sort.dir === -1 ? "↓" : "↑"}</span>}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map(({ m, s }) => {
            const sel = m.id === selected;
            const bar = s.status === "destaque" ? "bg-up" : s.status === "alerta" ? "bg-down" : "bg-transparent";
            const c24 = m.change24h ?? 0;
            return (
              <tr
                key={m.id}
                data-selected={sel}
                onClick={() => onSelect(m.id)}
                className={`cursor-pointer border-b border-line/50 transition-colors ${sel ? "bg-card2" : "hover:bg-card2/60"}`}
              >
                <td className="relative px-2 py-1.5 align-top">
                  <span className={`absolute inset-y-0 left-0 w-0.5 ${bar}`} />
                  <Star on={starred(m.id)} onClick={() => onStar(m.id)} label={m.question} />
                </td>
                <td className="w-full max-w-0 px-2 py-1.5">
                  <div className="flex items-start gap-2">
                    {m.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.image} alt="" className="mt-0.5 h-6 w-6 shrink-0 rounded object-cover" loading="lazy" />
                    )}
                    <div className="min-w-0">
                      <div className="line-clamp-2 font-medium leading-snug">{m.question}</div>
                      <div className="truncate text-[10px] text-muted">
                        <span className="text-poly">{m.category}</span>
                        {m.eventTitle !== m.question && ` · ${m.eventTitle}`}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-2 py-1.5 text-right">
                  <Flash value={m.probability} className="num text-sm font-semibold">
                    {(m.probability * 100).toFixed(m.probability < 0.01 ? 1 : 0)}%
                  </Flash>
                  <div className="mt-0.5 ml-auto h-1 w-12 overflow-hidden rounded bg-card2">
                    <div className="h-full bg-poly" style={{ width: `${m.probability * 100}%` }} />
                  </div>
                </td>
                <td className="px-1 py-1.5 text-right">
                  <span className="num inline-block min-w-[3.5rem] rounded px-1.5 py-0.5 font-semibold text-white" style={{ background: ptsBg(c24 * 100) }}>
                    {pts(m.change24h)}
                  </span>
                </td>
                <td className={`num hidden px-2 py-1.5 text-right @3xl:table-cell ${(m.change1h ?? 0) > 0 ? "text-up" : (m.change1h ?? 0) < 0 ? "text-down" : "text-muted"}`}>
                  {pts(m.change1h)}
                </td>
                <td className="hidden px-2 py-1.5 @2xl:table-cell">
                  <TrendChip trend={polyTrend(m)} />
                </td>
                <td className="num hidden px-2 py-1.5 text-right text-muted @xl:table-cell">{money(m.volume24h)}</td>
                <td className={`num hidden px-2 py-1.5 text-right @4xl:table-cell ${m.liquidity < 5000 ? "text-down" : "text-muted"}`}>{money(m.liquidity)}</td>
                <td className={`num hidden px-2 py-1.5 text-right @5xl:table-cell ${(m.spread ?? 0) > 0.05 ? "text-down" : "text-muted"}`}>
                  {m.spread === null ? "–" : `${(m.spread * 100).toFixed(1)}¢`}
                </td>
                <td className="num hidden px-2 py-1.5 text-right text-muted @4xl:table-cell">{endsText(hoursToEnd(m, now))}</td>
                <td className="px-2 py-1.5 text-right">
                  <ScorePill score={s.score} status={s.status} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length > MAX_ROWS && (
        <p className="px-3 py-2 text-center text-[10px] text-muted">
          Mostrando {MAX_ROWS} de {rows.length}. Use os filtros para ver os demais.
        </p>
      )}
    </div>
  );
}
