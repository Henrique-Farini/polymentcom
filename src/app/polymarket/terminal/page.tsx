"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AiExplain } from "@/components/AiExplain";
import { Heatmap } from "@/components/Heatmap";
import { MarketTable, type MarketRow } from "@/components/MarketTable";
import { OrderBook } from "@/components/OrderBook";
import { ProbabilityChart } from "@/components/PriceChart";
import { TrendChip } from "@/components/QuoteTable";
import { Card, Flash, LiveBadge, ScorePill, Segmented } from "@/components/ui";
import { usePolling, useStored, useWatchlist } from "@/lib/client/hooks";
import { usePolySettings } from "@/lib/client/settings";
import { STATUS_LABEL } from "@/lib/client/transitions";
import { money, prob, signedPts } from "@/lib/format";
import { polyTrend } from "@/lib/polymarket/trend";
import { POLY_CATEGORIES, type PolyMarket, type PolyMarketDetail } from "@/lib/polymarket/types";
import { scorePoly } from "@/lib/score/polymarket";

interface ListResp {
  markets: PolyMarket[];
  at: number;
  stale: boolean;
  error: string | null;
}

type Range = "1d" | "1s" | "1m" | "max";
const VOLUME_STEPS = [0, 10_000, 50_000, 250_000, 1_000_000];

export default function PolyTerminalPage() {
  const list = usePolling<ListResp>("/api/polymarket/markets", 15_000);
  const [settings] = usePolySettings();
  const watch = useWatchlist("polymarket");

  const [category, setCategory] = useStored<string>("radar:poly:terminal:category", "Todas");
  const [minVolIdx, setMinVolIdx] = useStored<number>("radar:poly:terminal:minvol", 1);
  const [selected, setSelected] = useStored<string | null>("radar:poly:terminal:selected", null);
  const [range, setRange] = useStored<Range>("radar:poly:terminal:range", "1s");
  const [query, setQuery] = useState("");

  const rows: MarketRow[] = useMemo(() => {
    const now = Date.now();
    return list.data?.markets.map((m) => ({ m, s: scorePoly(m, settings, now) })) ?? [];
  }, [list.data, settings]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      ({ m }) =>
        (category === "Todas" || (category === "★" ? watch.has(m.id) : m.category === category)) &&
        m.volume24h >= VOLUME_STEPS[minVolIdx] &&
        (!q || `${m.question} ${m.eventTitle}`.toLowerCase().includes(q)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, category, minVolIdx, query, watch.list]);

  // Abre no melhor score quando nada está selecionado ou o mercado saiu da lista.
  useEffect(() => {
    if (!rows.length) return;
    if (!selected || !rows.some((r) => r.m.id === selected)) {
      const best = [...rows].sort((x, y) => y.s.score - x.s.score)[0];
      setSelected(best.m.id);
    }
  }, [rows, selected, setSelected]);

  const sel = rows.find((r) => r.m.id === selected) ?? null;
  const detail = usePolling<PolyMarketDetail & { at: number; stale: boolean }>(
    selected ? `/api/polymarket/market/${selected}?range=${range}` : null,
    5_000,
  );
  // Preço do detalhe é mais recente (5s) que o da lista (15s).
  const m = detail.data && detail.data.market.id === selected ? { ...sel?.m, ...detail.data.market } : sel?.m;
  const s = useMemo(() => (m ? scorePoly(m as PolyMarket, settings) : null), [m, settings]);

  const cats = useMemo(() => {
    const map = new Map<string, { n: number; vol: number; up: number; down: number }>();
    for (const { m } of rows) {
      const c = map.get(m.category) ?? { n: 0, vol: 0, up: 0, down: 0 };
      c.n++;
      c.vol += m.volume24h;
      if ((m.change24h ?? 0) > 0.005) c.up++;
      if ((m.change24h ?? 0) < -0.005) c.down++;
      map.set(m.category, c);
    }
    return POLY_CATEGORIES.filter((c) => map.has(c)).map((c) => ({ name: c, ...map.get(c)! }));
  }, [rows]);

  const liquid = filtered.filter(({ m }) => m.liquidity >= settings.minLiquidity && m.probability > 0.03 && m.probability < 0.97);
  const risers = [...liquid].filter(({ m }) => (m.change24h ?? 0) > 0).sort((a, b) => (b.m.change24h ?? 0) - (a.m.change24h ?? 0)).slice(0, 5);
  const fallers = [...liquid].filter(({ m }) => (m.change24h ?? 0) < 0).sort((a, b) => (a.m.change24h ?? 0) - (b.m.change24h ?? 0)).slice(0, 5);
  const heat = [...filtered].sort((a, b) => b.m.volume24h - a.m.volume24h).slice(0, 48);
  const breadth = { up: filtered.filter((r) => (r.m.change24h ?? 0) > 0.005).length, down: filtered.filter((r) => (r.m.change24h ?? 0) < -0.005).length };

  return (
    <div className="space-y-3">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">
            <span className="text-poly">◆</span> Polymarket · Terminal
          </h1>
          <LiveBadge status={list.status} updatedAt={list.updatedAt} every="15s" error={list.error} />
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-muted">Probabilidades subindo × caindo (24h)</span>
          <div className="flex h-2 w-40 overflow-hidden rounded-full bg-card2">
            <div className="bg-up" style={{ width: `${(breadth.up / Math.max(1, breadth.up + breadth.down)) * 100}%` }} />
            <div className="bg-down" style={{ width: `${(breadth.down / Math.max(1, breadth.up + breadth.down)) * 100}%` }} />
          </div>
          <span className="num">
            <span className="text-up">{breadth.up}▲</span> <span className="text-down">{breadth.down}▼</span>
          </span>
        </div>
      </header>

      {/* Faixa de categorias */}
      {cats.length > 0 && (
        <div className="flex overflow-x-auto rounded-lg border border-line bg-card">
          {[{ name: "Todas", n: rows.length, vol: rows.reduce((a, r) => a + r.m.volume24h, 0), up: 0, down: 0 }, ...cats].map((c) => (
            <button
              key={c.name}
              type="button"
              onClick={() => setCategory(c.name)}
              className={`shrink-0 border-r border-line px-3 py-2 text-left last:border-r-0 ${category === c.name ? "bg-poly/15" : "hover:bg-card2"}`}
            >
              <div className={`text-[10px] uppercase tracking-wider ${category === c.name ? "text-poly" : "text-muted"}`}>{c.name}</div>
              <div className="num text-sm font-semibold">{money(c.vol)}</div>
              <div className="num text-[10px] text-muted">
                {c.n} mercados
                {c.name !== "Todas" && (
                  <>
                    {" "}· <span className="text-up">{c.up}▲</span> <span className="text-down">{c.down}▼</span>
                  </>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {list.status === "offline" && !list.data && (
        <div className="rounded-lg border border-down/40 bg-down/10 p-4 text-sm">Não consegui buscar os mercados. {list.error}</div>
      )}

      <div className="grid gap-3 xl:grid-cols-12">
        <Card className="min-w-0 overflow-hidden xl:col-span-5">
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
            <h2 className="text-sm font-semibold">Mercados</h2>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar…"
              className="ml-auto w-32 rounded-md border border-line bg-bg px-2 py-1 text-xs outline-none focus:border-poly"
            />
            <select
              value={minVolIdx}
              onChange={(e) => setMinVolIdx(Number(e.target.value))}
              className="rounded-md border border-line bg-bg px-1.5 py-1 text-xs"
              aria-label="Volume mínimo em 24h"
            >
              {VOLUME_STEPS.map((v, i) => (
                <option key={v} value={i}>
                  Vol ≥ {v === 0 ? "qualquer" : money(v)}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setCategory(category === "★" ? "Todas" : "★")}
              className={`rounded-md px-2 py-1 text-xs ${category === "★" ? "bg-warn text-black" : "bg-card2 text-muted hover:text-text"}`}
            >
              ★
            </button>
          </div>
          {list.data ? (
            filtered.length ? (
              <MarketTable rows={filtered} selected={selected} onSelect={setSelected} starred={watch.has} onStar={watch.toggle} />
            ) : (
              <p className="p-6 text-center text-sm text-muted">Nenhum mercado neste filtro.</p>
            )
          ) : (
            <p className="p-6 text-center text-sm text-muted">Carregando mercados…</p>
          )}
          <div className="border-t border-line px-3 py-1.5 text-[10px] text-muted">
            {filtered.length} mercados · clique ou use ↑ ↓ para trocar o gráfico · variações em pontos de probabilidade
          </div>
        </Card>

        <Card className="min-w-0 xl:col-span-7">
          {m ? (
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-3 py-2">
              <div className="flex min-w-0 flex-1 items-start gap-2">
                {m.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.image} alt="" className="h-10 w-10 shrink-0 rounded-md object-cover" />
                )}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-[10px]">
                    <span className="rounded bg-poly/20 px-1.5 py-0.5 text-poly">{m.category}</span>
                    <TrendChip trend={polyTrend(m as PolyMarket)} />
                  </div>
                  <div className="mt-0.5 font-semibold leading-snug">{m.question}</div>
                  <div className="num mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-muted">
                    {(m.outcomes ?? []).map((o, i) => (
                      <span key={o}>
                        {o} {prob(m.prices?.[i] ?? 0)}
                      </span>
                    ))}
                    <span>Vol 24h {money(m.volume24h ?? 0)}</span>
                    <span>Liq. {money(m.liquidity ?? 0)}</span>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <Flash value={m.probability ?? 0} className="num text-3xl font-bold text-poly">
                  {prob(m.probability ?? 0)}
                </Flash>
                <div className="num text-xs">
                  <span className={(m.change1h ?? 0) >= 0 ? "text-up" : "text-down"}>1h {signedPts(m.change1h ?? null)}</span>{" "}
                  <span className={(m.change24h ?? 0) >= 0 ? "text-up" : "text-down"}>24h {signedPts(m.change24h ?? null)}</span>{" "}
                  <span className={(m.change1w ?? 0) >= 0 ? "text-up" : "text-down"}>7d {signedPts(m.change1w ?? null)}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="border-b border-line px-3 py-3 text-sm text-muted">Selecione um mercado</div>
          )}
          <div className="flex items-center justify-between px-3 py-2">
            <Segmented<Range>
              value={range}
              onChange={setRange}
              accent="bg-poly text-white"
              options={[
                { value: "1d", label: "1D" },
                { value: "1s", label: "1S" },
                { value: "1m", label: "1M" },
                { value: "max", label: "Tudo" },
              ]}
            />
            {sel && (
              <Link href={`/polymarket/mercado/${sel.m.id}`} className="text-xs text-poly hover:underline">
                Página do mercado →
              </Link>
            )}
          </div>
          <div className="px-1 pb-2">
            <ProbabilityChart points={detail.data?.market.id === selected ? detail.data.history : []} resetKey={`${selected}:${range}`} height={420} />
            {detail.status === "offline" && <p className="px-3 text-xs text-down">{detail.error}</p>}
          </div>
        </Card>

        <Card className="self-start p-3 xl:col-span-7">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold">Mapa de calor · 48 mais negociados · variação 24h</h2>
            <span className="text-[10px] text-muted">em pontos de probabilidade</span>
          </div>
          <Heatmap
            items={heat.map(({ m }) => ({
              id: m.id,
              label: m.title.length <= 22 ? m.title : m.question,
              change: (m.change24h ?? 0) * 100,
              changeText: `${prob(m.probability)} · ${signedPts(m.change24h)}`,
              title: `${m.question}\n${prob(m.probability)} · ${signedPts(m.change24h)} pts em 24h`,
            }))}
            selected={selected}
            onSelect={setSelected}
            scale={10}
            legend={["-10 pts", "+10 pts"]}
            tileWidth={110}
          />
        </Card>

        <div className="space-y-3 xl:col-span-5">
          {m && s && (
            <Card className="p-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Sinal</h2>
                <div className="flex items-center gap-2">
                  <span className={`text-xs ${s.status === "destaque" ? "text-up" : s.status === "alerta" ? "text-down" : "text-muted"}`}>
                    {STATUS_LABEL[s.status]}
                  </span>
                  <ScorePill score={s.score} status={s.status} />
                </div>
              </div>
              <ul className="mt-2 space-y-1 text-xs">
                {s.alerts.map((x) => (
                  <li key={x} className="text-down">▼ {x}</li>
                ))}
                {s.reasons.map((x) => (
                  <li key={x} className="text-text/80">• {x}</li>
                ))}
              </ul>
            </Card>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Card className="py-2">
              <h2 className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-muted">Livro de ofertas</h2>
              {detail.data?.book && detail.data.market.id === selected && (detail.data.book.bids.length || detail.data.book.asks.length) ? (
                <OrderBook bids={detail.data.book.bids.slice(0, 7)} asks={detail.data.book.asks.slice(0, 7)} />
              ) : (
                <p className="px-3 text-xs text-muted">Indisponível.</p>
              )}
            </Card>
            <div className="space-y-3">
              {[
                { title: "Mais subiram 24h", list: risers, tone: "text-up" },
                { title: "Mais caíram 24h", list: fallers, tone: "text-down" },
              ].map((box) => (
                <Card key={box.title} className="p-3">
                  <h2 className={`mb-1 text-xs font-semibold uppercase tracking-wider ${box.tone}`}>{box.title}</h2>
                  {box.list.length === 0 && <p className="text-xs text-muted">Nenhum.</p>}
                  <ul className="focus-group space-y-0.5">
                    {box.list.map(({ m: x }) => (
                      <li key={x.id} className="focus-item">
                        <button type="button" onClick={() => setSelected(x.id)} className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-xs hover:bg-card2">
                          <span className="min-w-0 flex-1 truncate">{x.question}</span>
                          <span className={`num shrink-0 ${(x.change24h ?? 0) >= 0 ? "text-up" : "text-down"}`}>{signedPts(x.change24h)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </Card>
              ))}
            </div>
          </div>

          {sel && <AiExplain area="polymarket" id={sel.m.id} settings={settings} accent="poly" />}
        </div>
      </div>

      <p className="text-[11px] text-muted">
        Fonte: APIs públicas do Polymarket (lista a cada 15s, mercado selecionado a cada 5s). “Mais subiram/caíram” ignora mercados quase decididos e com liquidez abaixo do mínimo.
      </p>
    </div>
  );
}
