"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { TREND_META, trendOf, type Trend } from "@/lib/bolsa/trend";
import type { BolsaAsset } from "@/lib/bolsa/types";
import type { ScoreResult } from "@/lib/score/types";
import { Flash, ScorePill, Sparkline, Star } from "./ui";

export interface QuoteRow {
  a: BolsaAsset;
  s: ScoreResult;
}

type SortKey = "score" | "ativo" | "price" | "changePct" | "volume" | "volRatio" | "rsi" | "trend";

const num = (n: number | null, d = 2) =>
  n == null || !Number.isFinite(n) ? "–" : n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

function vol(n: number) {
  if (!n) return "–";
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return n.toFixed(0);
}

/** Cor de fundo da célula de variação: mais intensa quanto maior o movimento. */
function changeBg(pct: number) {
  const k = Math.min(1, Math.abs(pct) / 5);
  const alpha = 0.12 + k * 0.5;
  return pct >= 0 ? `rgba(34,197,94,${alpha})` : `rgba(239,68,68,${alpha})`;
}

export function TrendChip({ trend }: { trend: Trend }) {
  const m = TREND_META[trend];
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap ring-1 ${m.cls}`}>
      <span aria-hidden>{m.icon}</span>
      {m.label}
    </span>
  );
}

const COLS: { key: SortKey; label: string; align?: "right"; hide?: string; title?: string }[] = [
  { key: "ativo", label: "Ativo" },
  { key: "price", label: "Último", align: "right" },
  { key: "changePct", label: "Var %", align: "right" },
  { key: "trend", label: "Tendência", hide: "hidden @lg:table-cell" },
  { key: "volume", label: "Volume", align: "right", hide: "hidden @3xl:table-cell" },
  { key: "volRatio", label: "Vol/Méd", align: "right", hide: "hidden @2xl:table-cell", title: "Volume de hoje dividido pela média de 20 dias" },
  { key: "rsi", label: "RSI", align: "right", hide: "hidden @xl:table-cell" },
  { key: "score", label: "Score", align: "right" },
];

export function QuoteTable({
  rows,
  selected,
  onSelect,
  starred,
  onStar,
}: {
  rows: QuoteRow[];
  selected: string | null;
  onSelect: (symbol: string) => void;
  starred: (symbol: string) => boolean;
  onStar: (symbol: string) => void;
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "score", dir: -1 });
  const wrap = useRef<HTMLDivElement>(null);

  const sorted = useMemo(() => {
    const val = (r: QuoteRow): number | string => {
      switch (sort.key) {
        case "ativo":
          return r.a.display;
        case "price":
          return r.a.price;
        case "changePct":
          return r.a.changePct;
        case "volume":
          return r.a.volume;
        case "volRatio":
          return r.a.volRatio ?? -1;
        case "rsi":
          return r.a.rsi14 ?? -1;
        case "trend":
          return TREND_META[trendOf(r.a)].rank * 1000 + r.s.score;
        default:
          return r.s.score;
      }
    };
    return [...rows].sort((x, y) => {
      const a = val(x);
      const b = val(y);
      return (typeof a === "string" ? a.localeCompare(b as string) : a - (b as number)) * sort.dir;
    });
  }, [rows, sort]);

  // Mantém a linha selecionada visível ao navegar pelo teclado.
  useEffect(() => {
    wrap.current?.querySelector<HTMLElement>('[data-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  function onKey(e: React.KeyboardEvent) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const i = sorted.findIndex((r) => r.a.symbol === selected);
    const next = sorted[Math.max(0, Math.min(sorted.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))];
    if (next) onSelect(next.a.symbol);
  }

  return (
    <div ref={wrap} tabIndex={0} onKeyDown={onKey} className="@container max-h-[640px] overflow-auto outline-none" aria-label="Tabela de cotações. Use as setas para navegar.">
      <table className="w-full border-collapse text-xs">
        <thead className="sticky top-0 z-10 bg-card2 text-[10px] uppercase tracking-wider text-muted">
          <tr>
            <th className="w-6 px-2 py-2" />
            {COLS.map((c) => (
              <th key={c.key} className={`px-2 py-2 font-medium ${c.align === "right" ? "text-right" : "text-left"} ${c.hide ?? ""}`} title={c.title}>
                <button
                  type="button"
                  onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? (s.dir === 1 ? -1 : 1) : c.key === "ativo" ? 1 : -1 }))}
                  className={`inline-flex items-center gap-1 hover:text-text ${sort.key === c.key ? "text-text" : ""}`}
                >
                  {c.label}
                  {sort.key === c.key && <span aria-hidden>{sort.dir === -1 ? "↓" : "↑"}</span>}
                </button>
              </th>
            ))}
            <th className="hidden px-2 py-2 text-left font-medium @4xl:table-cell">30d</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(({ a, s }) => {
            const sel = a.symbol === selected;
            const statusBar = s.status === "destaque" ? "bg-up" : s.status === "alerta" ? "bg-down" : "bg-transparent";
            return (
              <tr
                key={a.symbol}
                data-selected={sel}
                onClick={() => onSelect(a.symbol)}
                className={`cursor-pointer border-b border-line/50 transition-colors ${sel ? "bg-card2" : "hover:bg-card2/60"}`}
              >
                <td className="relative px-2 py-1.5">
                  <span className={`absolute inset-y-0 left-0 w-0.5 ${statusBar}`} />
                  <Star on={starred(a.symbol)} onClick={() => onStar(a.symbol)} label={a.display} />
                </td>
                <td className="px-2 py-1.5">
                  <div className="num font-semibold">{a.display}</div>
                  <div className="max-w-[9rem] truncate text-[10px] text-muted">{a.name}</div>
                </td>
                <td className="px-2 py-1.5 text-right">
                  <Flash value={a.price} className="num font-medium">
                    {num(a.price)}
                  </Flash>
                </td>
                <td className="px-1 py-1.5 text-right">
                  <span className="num inline-block min-w-[4.5rem] rounded px-1.5 py-0.5 font-semibold text-white" style={{ background: changeBg(a.changePct) }}>
                    {a.changePct >= 0 ? "+" : ""}
                    {a.changePct.toFixed(2)}%
                  </span>
                </td>
                <td className="hidden px-2 py-1.5 @lg:table-cell">
                  <TrendChip trend={trendOf(a)} />
                </td>
                <td className="num hidden px-2 py-1.5 text-right text-muted @3xl:table-cell">{vol(a.volume)}</td>
                <td className={`num hidden px-2 py-1.5 text-right @2xl:table-cell ${a.volRatio !== null && a.volRatio >= 1.5 ? "text-warn" : "text-muted"}`}>
                  {a.volRatio === null ? "–" : `${a.volRatio.toFixed(1)}x`}
                </td>
                <td
                  className={`num hidden px-2 py-1.5 text-right @xl:table-cell ${
                    a.rsi14 === null ? "text-muted" : a.rsi14 >= 70 ? "text-warn" : a.rsi14 <= 30 ? "text-sky-400" : ""
                  }`}
                >
                  {num(a.rsi14, 0)}
                </td>
                <td className="px-2 py-1.5 text-right">
                  <ScorePill score={s.score} status={s.status} />
                </td>
                <td className="hidden px-2 py-1.5 @4xl:table-cell">
                  <Sparkline values={a.spark} width={70} height={22} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
