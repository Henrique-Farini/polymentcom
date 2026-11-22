"use client";

import { useEffect, useRef, useState } from "react";
import type { LiveStatus } from "@/lib/client/hooks";
import { useNow } from "@/lib/client/hooks";
import { clock, timeAgo } from "@/lib/format";
import type { ScoreComponent } from "@/lib/score/types";

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-line bg-card ${className}`}>{children}</section>;
}

const STATUS_STYLE: Record<LiveStatus, { dot: string; text: string }> = {
  carregando: { dot: "bg-muted", text: "text-muted" },
  "ao vivo": { dot: "bg-up live-dot", text: "text-up" },
  atrasado: { dot: "bg-warn", text: "text-warn" },
  offline: { dot: "bg-down", text: "text-down" },
};

export function LiveBadge({
  status,
  updatedAt,
  every,
  error,
}: {
  status: LiveStatus;
  updatedAt: number | null;
  every: string;
  error?: string | null;
}) {
  const now = useNow(5000);
  const s = STATUS_STYLE[status];
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" title={error ?? undefined}>
      <span className={`inline-flex items-center gap-1.5 font-medium uppercase tracking-wide ${s.text}`}>
        <span className={`h-2 w-2 rounded-full ${s.dot}`} />
        {status}
      </span>
      {updatedAt && (
        <span className="text-muted">
          atualizado {clock(updatedAt)} ({timeAgo(updatedAt, now)}) · a cada {every}
        </span>
      )}
      {error && <span className="text-warn">{error}</span>}
    </div>
  );
}

/** Pisca verde/vermelho quando o valor muda. */
export function Flash({ value, children, className = "" }: { value: number; children: React.ReactNode; className?: string }) {
  const prev = useRef(value);
  const [cls, setCls] = useState("");
  const [key, setKey] = useState(0);
  useEffect(() => {
    if (value !== prev.current) {
      setCls(value > prev.current ? "flash-up" : "flash-down");
      setKey((k) => k + 1);
      prev.current = value;
    }
  }, [value]);
  return (
    <span key={key} className={`rounded px-1 ${cls} ${className}`}>
      {children}
    </span>
  );
}

export function Sparkline({ values, width = 90, height = 28 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return <svg width={width} height={height} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = width / (values.length - 1);
  const d = values.map((v, i) => `${i ? "L" : "M"}${(i * step).toFixed(1)},${(height - 2 - ((v - min) / span) * (height - 4)).toFixed(1)}`).join("");
  const up = values[values.length - 1] >= values[0];
  return (
    <svg width={width} height={height} className="shrink-0" aria-hidden>
      <path d={d} fill="none" stroke={up ? "var(--color-up)" : "var(--color-down)"} strokeWidth={1.5} />
    </svg>
  );
}

export function ScorePill({ score, status }: { score: number; status: "destaque" | "neutro" | "alerta" }) {
  const color =
    status === "destaque" ? "bg-up/15 text-up ring-up/30" : status === "alerta" ? "bg-down/15 text-down ring-down/30" : "bg-card2 text-muted ring-line";
  return <span className={`num inline-flex min-w-11 justify-center rounded-md px-2 py-0.5 text-sm font-semibold ring-1 ${color}`}>{score}</span>;
}

export function ScoreBreakdown({ components, accent = "bg-up" }: { components: ScoreComponent[]; accent?: string }) {
  return (
    <ul className="space-y-3">
      {components.map((c) => (
        <li key={c.key}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span>{c.label}</span>
            <span className="num text-muted">
              <span className="text-text">{c.points.toFixed(0)}</span> / {c.weight ? ((c.weight / components.reduce((a, x) => a + x.weight, 0)) * 100).toFixed(0) : 0}
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded bg-card2">
            <div className={`h-full ${accent}`} style={{ width: `${(c.value * 100).toFixed(0)}%` }} />
          </div>
          <div className="mt-1 text-xs text-muted">{c.note}</div>
        </li>
      ))}
    </ul>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  accent = "bg-up text-black",
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  accent?: string;
}) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-card p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
            value === o.value ? accent : "text-muted hover:text-text"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Star({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      aria-label={on ? `Remover ${label} dos favoritos` : `Adicionar ${label} aos favoritos`}
      aria-pressed={on}
      className={`text-base leading-none ${on ? "text-warn" : "text-muted/50 hover:text-muted"}`}
    >
      {on ? "★" : "☆"}
    </button>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "up" | "down" | "warn" | "poly" }) {
  const toneClass = tone === "up" ? "text-up" : tone === "down" ? "text-down" : tone === "warn" ? "text-warn" : tone === "poly" ? "text-poly" : "text-text";
  return (
    <Card className="p-4">
      <div className="text-xs uppercase tracking-wider text-muted">{label}</div>
      <div className={`num mt-1 text-3xl font-semibold ${toneClass}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </Card>
  );
}
