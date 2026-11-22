"use client";

import { useMemo, useState } from "react";
import { RankingBoard, type RankItem } from "@/components/RankingBoard";
import { LiveBadge, Segmented, Stat } from "@/components/ui";
import { usePolling, useWatchlist } from "@/lib/client/hooks";
import { usePolySettings } from "@/lib/client/settings";
import { useTransitions } from "@/lib/client/transitions";
import { money, prob, signedPts } from "@/lib/format";
import { POLY_CATEGORIES, type PolyMarket } from "@/lib/polymarket/types";
import { hoursToEnd, scorePoly } from "@/lib/score/polymarket";

interface Resp {
  markets: PolyMarket[];
  at: number;
  stale: boolean;
  error: string | null;
}

type EndFilter = "todos" | "24h" | "7d" | "30d";

const VOLUME_STEPS = [0, 10_000, 50_000, 250_000, 1_000_000];

export default function PolymarketPage() {
  const { data, status, updatedAt, error } = usePolling<Resp>("/api/polymarket/markets", 15_000);
  const [settings] = usePolySettings();
  const watch = useWatchlist("polymarket");

  const [category, setCategory] = useState<string>("Todas");
  const [query, setQuery] = useState("");
  const [minVolIdx, setMinVolIdx] = useState(1);
  const [ends, setEnds] = useState<EndFilter>("todos");
  const [onlyStar, setOnlyStar] = useState(false);

  const scored = useMemo(() => {
    if (!data?.markets) return null;
    const now = Date.now();
    return data.markets.map((m) => ({ m, s: scorePoly(m, settings, now) }));
  }, [data, settings]);

  const transitions = useTransitions(
    "polymarket",
    useMemo(
      () =>
        scored?.map(({ m, s }) => ({
          id: m.id,
          label: m.question,
          status: s.status,
          score: s.score,
          detail: (s.status === "alerta" ? s.alerts : s.reasons).slice(0, 2).join(" · "),
        })) ?? null,
      [scored],
    ),
    watch.list,
  );

  const categories = useMemo(() => {
    const present = new Set(scored?.map(({ m }) => m.category));
    return ["Todas", ...POLY_CATEGORIES.filter((c) => present.has(c))];
  }, [scored]);

  const items: RankItem[] = useMemo(() => {
    if (!scored) return [];
    const q = query.trim().toLowerCase();
    const maxHours = ends === "24h" ? 24 : ends === "7d" ? 168 : ends === "30d" ? 720 : Infinity;
    return scored
      .filter(({ m }) => category === "Todas" || m.category === category)
      .filter(({ m }) => m.volume24h >= VOLUME_STEPS[minVolIdx])
      .filter(({ m }) => {
        if (maxHours === Infinity) return true;
        const h = hoursToEnd(m);
        return h !== null && h <= maxHours;
      })
      .filter(({ m }) => !q || `${m.question} ${m.eventTitle} ${m.title}`.toLowerCase().includes(q))
      .filter(({ m }) => !onlyStar || watch.has(m.id))
      .map(({ m, s }) => ({
        id: m.id,
        href: `/polymarket/mercado/${m.id}`,
        title: m.question,
        subtitle: m.eventTitle !== m.question ? m.eventTitle : "",
        tag: m.category,
        image: m.image,
        value: m.probability,
        valueText: prob(m.probability),
        changeText: `${signedPts(m.change24h)} pts 24h`,
        changeSign: m.change24h ?? 0,
        score: s.score,
        status: s.status,
        reasons: s.reasons,
        alerts: s.alerts,
        starred: watch.has(m.id),
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scored, category, query, minVolIdx, ends, onlyStar, watch.list]);

  const stats = useMemo(() => {
    const withChange = (scored ?? []).filter(
      ({ m }) => m.change24h !== null && m.liquidity >= settings.minLiquidity && m.probability > 0.03 && m.probability < 0.97,
    );
    const up = withChange.reduce<PolyMarket | null>((best, { m }) => (!best || m.change24h! > best.change24h! ? m : best), null);
    const down = withChange.reduce<PolyMarket | null>((best, { m }) => (!best || m.change24h! < best.change24h! ? m : best), null);
    const volume = (scored ?? []).reduce((a, { m }) => a + m.volume24h, 0);
    return { up, down, volume };
  }, [scored, settings.minLiquidity]);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">
            <span className="text-poly">◆</span> Polymarket · Ranking ao vivo
          </h1>
          <LiveBadge status={status} updatedAt={updatedAt} every="15s" error={error} />
        </div>
      </header>

      {status === "offline" && !data && (
        <div className="rounded-lg border border-down/40 bg-down/10 p-4 text-sm">
          Não consegui buscar os mercados. {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Em destaque" value={items.filter((i) => i.status === "destaque").length} tone="up" sub="score ≥ mínimo, sem alertas" />
        <Stat label="Em alerta" value={items.filter((i) => i.status === "alerta").length} tone="down" sub="queda forte ou risco" />
        <Stat
          label="Maior alta 24h"
          value={stats.up ? `${signedPts(stats.up.change24h)} pts` : "–"}
          tone="warn"
          sub={stats.up ? `${stats.up.title} · ${prob(stats.up.probability)}` : undefined}
        />
        <Stat label="Volume 24h (lista)" value={money(stats.volume)} tone="poly" sub={`${scored?.length ?? 0} mercados abertos`} />
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-card p-3">
        <div className="flex flex-wrap gap-1">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={`rounded-full px-3 py-1 text-xs ${category === c ? "bg-poly text-white" : "bg-card2 text-muted hover:text-text"}`}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar mercado…"
            className="w-44 rounded-md border border-line bg-bg px-2.5 py-1.5 text-sm outline-none focus:border-poly"
          />
          <label className="flex items-center gap-1 text-xs text-muted">
            Volume 24h ≥
            <select
              value={minVolIdx}
              onChange={(e) => setMinVolIdx(Number(e.target.value))}
              className="rounded-md border border-line bg-bg px-1.5 py-1 text-text"
            >
              {VOLUME_STEPS.map((v, i) => (
                <option key={v} value={i}>
                  {v === 0 ? "qualquer" : money(v)}
                </option>
              ))}
            </select>
          </label>
          <Segmented<EndFilter>
            value={ends}
            onChange={setEnds}
            accent="bg-poly text-white"
            options={[
              { value: "todos", label: "Qualquer data" },
              { value: "24h", label: "Encerra 24h" },
              { value: "7d", label: "7 dias" },
              { value: "30d", label: "30 dias" },
            ]}
          />
          <button
            type="button"
            onClick={() => setOnlyStar((v) => !v)}
            className={`rounded-md px-2.5 py-1 text-xs ${onlyStar ? "bg-warn text-black" : "bg-card2 text-muted hover:text-text"}`}
          >
            ★ Favoritos
          </button>
        </div>
      </div>

      {data && (
        <RankingBoard
          items={items}
          onStar={watch.toggle}
          history={transitions.history}
          onClearHistory={transitions.clearHistory}
        />
      )}
      {!data && status === "carregando" && <p className="py-10 text-center text-sm text-muted">Carregando mercados…</p>}
    </div>
  );
}
