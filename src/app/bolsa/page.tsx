"use client";

import { useMemo, useState } from "react";
import { RankingBoard, type RankItem } from "@/components/RankingBoard";
import { Flash, LiveBadge, Segmented, Sparkline, Stat } from "@/components/ui";
import type { BolsaAsset, BolsaMarket } from "@/lib/bolsa/types";
import { usePolling, useWatchlist } from "@/lib/client/hooks";
import { useBolsaSettings, useBolsaUniverse } from "@/lib/client/settings";
import { useTransitions } from "@/lib/client/transitions";
import { price, signedPct } from "@/lib/format";
import { scoreBolsa } from "@/lib/score/bolsa";

interface Resp {
  assets: BolsaAsset[];
  failed: string[];
  at: number;
  stale?: boolean;
}

type MarketFilter = "Todos" | BolsaMarket;

export default function BolsaPage() {
  const [universe, , ready] = useBolsaUniverse();
  const url = ready ? `/api/bolsa/assets?symbols=${encodeURIComponent(universe.join(","))}` : null;
  const { data, status, updatedAt, error } = usePolling<Resp>(url, 30_000);
  const [settings] = useBolsaSettings();
  const watch = useWatchlist("bolsa");
  const [market, setMarket] = useState<MarketFilter>("Todos");
  const [query, setQuery] = useState("");
  const [onlyStar, setOnlyStar] = useState(false);

  const scored = useMemo(() => data?.assets.map((a) => ({ a, s: scoreBolsa(a, settings) })) ?? null, [data, settings]);

  const transitions = useTransitions(
    "bolsa",
    useMemo(
      () =>
        scored?.map(({ a, s }) => ({
          id: a.symbol,
          label: a.display,
          status: s.status,
          score: s.score,
          detail: (s.status === "alerta" ? s.alerts : s.reasons).slice(0, 2).join(" · "),
        })) ?? null,
      [scored],
    ),
    watch.list,
  );

  const items: RankItem[] = useMemo(() => {
    if (!scored) return [];
    const q = query.trim().toLowerCase();
    return scored
      .filter(({ a }) => market === "Todos" || a.market === market)
      .filter(({ a }) => !q || `${a.display} ${a.name}`.toLowerCase().includes(q))
      .filter(({ a }) => !onlyStar || watch.has(a.symbol))
      .map(({ a, s }) => ({
        id: a.symbol,
        href: `/bolsa/ativo/${encodeURIComponent(a.symbol)}`,
        title: a.display,
        subtitle: a.name,
        tag: a.market,
        value: a.price,
        valueText: price(a.price, a.currency),
        changeText: signedPct(a.changePct),
        changeSign: a.changePct,
        score: s.score,
        status: s.status,
        spark: a.spark,
        reasons: s.reasons,
        alerts: s.alerts,
        starred: watch.has(a.symbol),
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scored, market, query, onlyStar, watch.list]);

  const indices = data?.assets.filter((a) => a.market === "Índices" || a.symbol === "BRL=X" || a.symbol === "BTC-USD") ?? [];
  const movers = useMemo(() => {
    const eq = (data?.assets ?? []).filter((a) => a.market === "B3" || a.market === "EUA");
    const best = eq.reduce<BolsaAsset | null>((b, a) => (!b || a.changePct > b.changePct ? a : b), null);
    const worst = eq.reduce<BolsaAsset | null>((b, a) => (!b || a.changePct < b.changePct ? a : b), null);
    return { best, worst };
  }, [data]);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold">
          <span className="text-up">▲</span> Bolsa · Ranking ao vivo
        </h1>
        <LiveBadge status={status} updatedAt={updatedAt} every="30s" error={error} />
        {data && data.failed.length > 0 && (
          <p className="mt-1 text-xs text-warn">Sem dados para: {data.failed.join(", ")}</p>
        )}
      </header>

      {status === "offline" && !data && (
        <div className="rounded-lg border border-down/40 bg-down/10 p-4 text-sm">Não consegui buscar as cotações. {error}</div>
      )}

      {indices.length > 0 && (
        <div className="flex gap-2 overflow-x-auto rounded-xl border border-line bg-card px-3 py-2">
          {indices.map((a) => (
            <div key={a.symbol} className="flex shrink-0 items-center gap-3 border-r border-line pr-3 last:border-r-0">
              <div>
                <div className="text-xs text-muted">{a.display}</div>
                <Flash value={a.price} className="num text-sm font-medium">
                  {price(a.price)}
                </Flash>
              </div>
              <span className={`num text-xs ${a.changePct >= 0 ? "text-up" : "text-down"}`}>{signedPct(a.changePct)}</span>
              <Sparkline values={a.spark} width={60} height={22} />
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Em destaque" value={items.filter((i) => i.status === "destaque").length} tone="up" sub="score ≥ mínimo, sem alertas" />
        <Stat label="Em alerta" value={items.filter((i) => i.status === "alerta").length} tone="down" sub="queda forte ou risco" />
        <Stat
          label="Maior alta do dia"
          value={movers.best ? signedPct(movers.best.changePct, 1) : "–"}
          tone="warn"
          sub={movers.best ? `${movers.best.display} · ${price(movers.best.price, movers.best.currency)}` : undefined}
        />
        <Stat
          label="Maior queda do dia"
          value={movers.worst ? signedPct(movers.worst.changePct, 1) : "–"}
          tone="down"
          sub={movers.worst ? `${movers.worst.display} · ${price(movers.worst.price, movers.worst.currency)}` : undefined}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-card p-3">
        <Segmented<MarketFilter>
          value={market}
          onChange={setMarket}
          options={[
            { value: "Todos", label: "Todos" },
            { value: "B3", label: "B3" },
            { value: "EUA", label: "EUA" },
            { value: "Índices", label: "Índices" },
            { value: "Cripto/Câmbio", label: "Cripto/Câmbio" },
          ]}
        />
        <div className="ml-auto flex items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar ativo…"
            className="w-40 rounded-md border border-line bg-bg px-2.5 py-1.5 text-sm outline-none focus:border-up"
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

      {data && <RankingBoard items={items} onStar={watch.toggle} history={transitions.history} onClearHistory={transitions.clearHistory} />}
      {!data && status === "carregando" && <p className="py-10 text-center text-sm text-muted">Carregando cotações…</p>}

      <p className="text-xs text-muted">
        Fonte: Yahoo Finance. Ações da B3 costumam vir com atraso de até 15 min; EUA e cripto chegam perto do tempo real.
        Os indicadores usam candles diários.
      </p>
    </div>
  );
}
