"use client";

import Link from "next/link";
import { useState } from "react";
import { STATUS_LABEL, type Transition } from "@/lib/client/transitions";
import { clock } from "@/lib/format";
import type { SignalStatus } from "@/lib/score/types";
import { Card, Flash, ScorePill, Sparkline, Star } from "./ui";

export interface RankItem {
  id: string;
  href: string;
  title: string;
  subtitle: string;
  tag: string;
  image?: string | null;
  value: number;
  valueText: string;
  changeText: string;
  changeSign: number;
  score: number;
  status: SignalStatus;
  spark?: number[];
  reasons: string[];
  alerts: string[];
  starred: boolean;
}

function Row({ item, onStar, showReasons }: { item: RankItem; onStar: () => void; showReasons: "reasons" | "alerts" | "none" }) {
  const lines = showReasons === "alerts" ? item.alerts : showReasons === "reasons" ? item.reasons : [];
  return (
    <li className="row-enter">
      <Link
        href={item.href}
        className="flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-card2"
      >
        <div className="pt-0.5">
          <Star on={item.starred} onClick={onStar} label={item.title} />
        </div>
        {item.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.image} alt="" className="mt-0.5 h-8 w-8 shrink-0 rounded-md object-cover" loading="lazy" />
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 font-medium leading-snug">{item.title}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
            <span className="shrink-0 rounded bg-card2 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">{item.tag}</span>
            <span className="truncate">{item.subtitle}</span>
          </div>
          {lines.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-xs">
              {lines.slice(0, 3).map((r) => (
                <li key={r} className={showReasons === "alerts" ? "text-down/90" : "text-text/80"}>
                  {showReasons === "alerts" ? "▼ " : "• "}
                  {r}
                </li>
              ))}
            </ul>
          )}
        </div>
        {item.spark && item.spark.length > 1 && (
          <div className="hidden pt-1 sm:block">
            <Sparkline values={item.spark} />
          </div>
        )}
        <div className="shrink-0 text-right">
          <Flash value={item.value} className="num block text-sm font-medium">
            {item.valueText}
          </Flash>
          <div className={`num text-xs ${item.changeSign > 0 ? "text-up" : item.changeSign < 0 ? "text-down" : "text-muted"}`}>
            {item.changeText}
          </div>
        </div>
        <div className="shrink-0 pt-0.5">
          <ScorePill score={item.score} status={item.status} />
        </div>
      </Link>
    </li>
  );
}

function Column({
  title,
  hint,
  items,
  tone,
  onStar,
  mode,
}: {
  title: string;
  hint: string;
  items: RankItem[];
  tone: "up" | "down";
  onStar: (id: string) => void;
  mode: "reasons" | "alerts";
}) {
  const [limit, setLimit] = useState(12);
  return (
    <Card className="flex min-w-0 flex-col">
      <header className="flex items-baseline justify-between border-b border-line px-4 py-3">
        <div>
          <h2 className={`text-sm font-semibold ${tone === "up" ? "text-up" : "text-down"}`}>
            {tone === "up" ? "🟢" : "🔴"} {title}
          </h2>
          <p className="text-xs text-muted">{hint}</p>
        </div>
        <span className="num text-2xl font-semibold">{items.length}</span>
      </header>
      {items.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted">Nada aqui agora.</p>
      ) : (
        <ul className="divide-y divide-line/60 p-1">
          {items.slice(0, limit).map((i) => (
            <Row key={i.id} item={i} onStar={() => onStar(i.id)} showReasons={mode} />
          ))}
        </ul>
      )}
      {items.length > limit && (
        <button type="button" onClick={() => setLimit((l) => l + 20)} className="border-t border-line py-2 text-xs text-muted hover:text-text">
          Mostrar mais ({items.length - limit})
        </button>
      )}
    </Card>
  );
}

export function RankingBoard({
  items,
  onStar,
  history,
  onClearHistory,
}: {
  items: RankItem[];
  onStar: (id: string) => void;
  history: Transition[];
  onClearHistory: () => void;
}) {
  const [showNeutral, setShowNeutral] = useState(false);
  const destaque = items.filter((i) => i.status === "destaque").sort((a, b) => b.score - a.score);
  const alerta = items.filter((i) => i.status === "alerta").sort((a, b) => a.score - b.score);
  const neutro = items.filter((i) => i.status === "neutro").sort((a, b) => b.score - a.score);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Column title="Em destaque" hint="Sinais positivos agora, ordenados por score" items={destaque} tone="up" onStar={onStar} mode="reasons" />
        <Column title="Em alerta" hint="Queda forte ou risco: não compensam agora" items={alerta} tone="down" onStar={onStar} mode="alerts" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <button
            type="button"
            onClick={() => setShowNeutral((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-3 text-left"
            aria-expanded={showNeutral}
          >
            <span className="text-sm font-semibold text-muted">⚪ Neutros ({neutro.length})</span>
            <span className="text-xs text-muted">{showNeutral ? "Esconder" : "Mostrar"}</span>
          </button>
          {showNeutral && (
            <ul className="divide-y divide-line/60 border-t border-line p-1">
              {neutro.slice(0, 80).map((i) => (
                <Row key={i.id} item={i} onStar={() => onStar(i.id)} showReasons="none" />
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <header className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold">Histórico de mudanças</h2>
            {history.length > 0 && (
              <button type="button" onClick={onClearHistory} className="text-xs text-muted hover:text-text">
                Limpar
              </button>
            )}
          </header>
          {history.length === 0 ? (
            <p className="px-4 py-6 text-xs text-muted">
              Quando algo entrar ou sair de uma lista, aparece aqui. Deixe a página aberta.
            </p>
          ) : (
            <ul className="max-h-96 space-y-2 overflow-y-auto px-4 py-3 text-xs">
              {history.map((h) => (
                <li key={`${h.id}-${h.at}`} className="row-enter">
                  <span className="num text-muted">{clock(h.at)}</span>{" "}
                  <span className="font-medium">{h.label}</span>{" "}
                  <span className="text-muted">{STATUS_LABEL[h.from]} →</span>{" "}
                  <span className={h.to === "destaque" ? "text-up" : h.to === "alerta" ? "text-down" : "text-muted"}>
                    {STATUS_LABEL[h.to]}
                  </span>
                  {h.detail && <div className="text-muted">{h.detail}</div>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
