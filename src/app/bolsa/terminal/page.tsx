"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AiExplain } from "@/components/AiExplain";
import { Heatmap } from "@/components/Heatmap";
import { QuoteTable, TrendChip, type QuoteRow } from "@/components/QuoteTable";
import { DEFAULT_INDICATORS, INDICATOR_META, TerminalChart, type ChartIndicators } from "@/components/TerminalChart";
import { Card, Flash, LiveBadge, ScorePill, Segmented, Sparkline } from "@/components/ui";
import { trendOf } from "@/lib/bolsa/trend";
import type { BolsaAsset, BolsaAssetDetail, BolsaMarket } from "@/lib/bolsa/types";
import { usePolling, useStored, useWatchlist } from "@/lib/client/hooks";
import { useBolsaSettings, useBolsaUniverse } from "@/lib/client/settings";
import { STATUS_LABEL } from "@/lib/client/transitions";
import { price, signedPct } from "@/lib/format";
import { scoreBolsa } from "@/lib/score/bolsa";

interface ListResp {
  assets: BolsaAsset[];
  failed: string[];
  at: number;
  stale?: boolean;
}

type MarketFilter = "Todos" | "★" | BolsaMarket;
type Range = "1d" | "5d" | "1m" | "6m" | "1a" | "5a";

const RANGES: { value: Range; label: string }[] = [
  { value: "1d", label: "1D" },
  { value: "5d", label: "5D" },
  { value: "1m", label: "1M" },
  { value: "6m", label: "6M" },
  { value: "1a", label: "1A" },
  { value: "5a", label: "5A" },
];

const fmt = (n: number | null, d = 2) => (n == null ? "–" : n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }));

export default function TerminalPage() {
  const [universe, , ready] = useBolsaUniverse();
  const listUrl = ready ? `/api/bolsa/assets?symbols=${encodeURIComponent(universe.join(","))}` : null;
  const list = usePolling<ListResp>(listUrl, 30_000);
  const [settings] = useBolsaSettings();
  const watch = useWatchlist("bolsa");

  const [market, setMarket] = useStored<MarketFilter>("radar:bolsa:terminal:market", "Todos");
  const [selected, setSelected] = useStored<string | null>("radar:bolsa:terminal:selected", null);
  const [range, setRange] = useStored<Range>("radar:bolsa:terminal:range", "6m");
  const [ind, setInd] = useStored<ChartIndicators>("radar:bolsa:terminal:indicators", DEFAULT_INDICATORS, true);
  const [hoverInd, setHoverInd] = useState<keyof ChartIndicators | null>(null);

  const rows: QuoteRow[] = useMemo(
    () => list.data?.assets.map((a) => ({ a, s: scoreBolsa(a, settings) })) ?? [],
    [list.data, settings],
  );
  const filtered = useMemo(
    () =>
      rows.filter((r) =>
        market === "Todos" ? true : market === "★" ? watch.has(r.a.symbol) : r.a.market === market,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, market, watch.list],
  );

  // Seleciona o melhor score quando nada está selecionado (ou o selecionado sumiu da lista).
  useEffect(() => {
    if (!rows.length) return;
    if (!selected || !rows.some((r) => r.a.symbol === selected)) {
      const best = [...rows].filter((r) => r.a.market === "B3" || r.a.market === "EUA").sort((x, y) => y.s.score - x.s.score)[0] ?? rows[0];
      setSelected(best.a.symbol);
    }
  }, [rows, selected, setSelected]);

  const sel = rows.find((r) => r.a.symbol === selected) ?? null;
  const detail = usePolling<BolsaAssetDetail & { at: number; stale: boolean }>(
    selected ? `/api/bolsa/asset/${encodeURIComponent(selected)}?range=${range}` : null,
    range === "1d" ? 20_000 : 60_000,
  );

  const indices = list.data?.assets.filter((a) => a.market === "Índices" || a.market === "Cripto/Câmbio") ?? [];
  const equities = rows.filter((r) => r.a.market === "B3" || r.a.market === "EUA");
  const gainers = equities.filter((r) => r.a.changePct > 0).sort((x, y) => y.a.changePct - x.a.changePct).slice(0, 5);
  const losers = equities.filter((r) => r.a.changePct < 0).sort((x, y) => x.a.changePct - y.a.changePct).slice(0, 5);
  const breadth = {
    up: filtered.filter((r) => r.a.changePct > 0).length,
    down: filtered.filter((r) => r.a.changePct < 0).length,
  };

  return (
    <div className="space-y-3">
      {/* Cabeçalho */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">
            <span className="text-up">▲</span> Bolsa · Terminal
          </h1>
          <LiveBadge status={list.status} updatedAt={list.updatedAt} every="30s" error={list.error} />
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-muted">Amplitude</span>
          <div className="flex h-2 w-40 overflow-hidden rounded-full bg-card2" title={`${breadth.up} subindo, ${breadth.down} caindo`}>
            <div className="bg-up" style={{ width: `${(breadth.up / Math.max(1, breadth.up + breadth.down)) * 100}%` }} />
            <div className="bg-down" style={{ width: `${(breadth.down / Math.max(1, breadth.up + breadth.down)) * 100}%` }} />
          </div>
          <span className="num">
            <span className="text-up">{breadth.up}▲</span> <span className="text-down">{breadth.down}▼</span>
          </span>
        </div>
      </header>

      {/* Faixa de índices */}
      {indices.length > 0 && (
        <div className="flex gap-0 overflow-x-auto rounded-lg border border-line bg-card">
          {indices.map((a) => (
            <button
              key={a.symbol}
              type="button"
              onClick={() => setSelected(a.symbol)}
              className="flex shrink-0 items-center gap-3 border-r border-line px-3 py-2 text-left last:border-r-0 hover:bg-card2"
            >
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted">{a.display}</div>
                <Flash value={a.price} className="num text-sm font-semibold">
                  {price(a.price)}
                </Flash>
              </div>
              <span className={`num text-xs font-semibold ${a.changePct >= 0 ? "text-up" : "text-down"}`}>
                {a.changePct >= 0 ? "▲" : "▼"} {signedPct(a.changePct)}
              </span>
              <Sparkline values={a.spark} width={56} height={20} />
            </button>
          ))}
        </div>
      )}

      {list.status === "offline" && !list.data && (
        <div className="rounded-lg border border-down/40 bg-down/10 p-4 text-sm">Não consegui buscar as cotações. {list.error}</div>
      )}

      <div className="grid gap-3 xl:grid-cols-12">
        {/* Tabela de cotações */}
        <Card className="min-w-0 overflow-hidden xl:col-span-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
            <h2 className="text-sm font-semibold">Cotações</h2>
            <Segmented<MarketFilter>
              value={market}
              onChange={setMarket}
              options={[
                { value: "Todos", label: "Todos" },
                { value: "B3", label: "B3" },
                { value: "EUA", label: "EUA" },
                { value: "Índices", label: "Índices" },
                { value: "Cripto/Câmbio", label: "Cripto" },
                { value: "★", label: "★" },
              ]}
            />
          </div>
          {list.data ? (
            filtered.length ? (
              <QuoteTable rows={filtered} selected={selected} onSelect={setSelected} starred={watch.has} onStar={watch.toggle} />
            ) : (
              <p className="p-6 text-center text-sm text-muted">Nenhum ativo neste filtro.</p>
            )
          ) : (
            <p className="p-6 text-center text-sm text-muted">Carregando cotações…</p>
          )}
          <div className="border-t border-line px-3 py-1.5 text-[10px] text-muted">
            Clique numa linha ou use ↑ ↓ para trocar o gráfico. Barra verde/vermelha à esquerda = em destaque / em alerta.
          </div>
        </Card>

        {/* Gráfico */}
        <Card className="min-w-0 xl:col-span-7">
          {sel ? (
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-3 py-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="num text-lg font-bold">{sel.a.display}</span>
                  <span className="truncate text-xs text-muted">{sel.a.name}</span>
                  <TrendChip trend={trendOf(sel.a)} />
                </div>
                <div className="num mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-muted">
                  <span>Abert. {fmt(sel.a.dayOpen)}</span>
                  <span>Máx. {fmt(sel.a.dayHigh)}</span>
                  <span>Mín. {fmt(sel.a.dayLow)}</span>
                  <span>52s {fmt(sel.a.low52)} – {fmt(sel.a.high52)}</span>
                </div>
              </div>
              <div className="text-right">
                <Flash value={sel.a.price} className="num text-2xl font-bold">
                  {price(sel.a.price, sel.a.currency)}
                </Flash>
                <div className={`num text-sm font-semibold ${sel.a.changePct >= 0 ? "text-up" : "text-down"}`}>
                  {sel.a.changePct >= 0 ? "▲" : "▼"} {fmt(sel.a.changeAbs)} ({signedPct(sel.a.changePct)})
                </div>
              </div>
            </div>
          ) : (
            <div className="border-b border-line px-3 py-3 text-sm text-muted">Selecione um ativo</div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
            <Segmented<Range> value={range} onChange={setRange} options={RANGES} />
            <div className="flex flex-wrap gap-1">
              {INDICATOR_META.map((m) => {
                const on = ind[m.key];
                return (
                  <button
                    key={m.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setInd({ ...ind, [m.key]: !on })}
                    onMouseEnter={() => on && setHoverInd(m.key)}
                    onMouseLeave={() => setHoverInd(null)}
                    onFocus={() => on && setHoverInd(m.key)}
                    onBlur={() => setHoverInd(null)}
                    className={`rounded border px-2 py-0.5 text-[11px] transition-colors ${on ? "border-line bg-card2 text-text" : "border-transparent text-muted hover:text-text"}`}
                  >
                    <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: on ? m.color : "#3a4744" }} />
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="px-1 pb-2">
            <TerminalChart
              candles={detail.data?.candles ?? []}
              resetKey={`${selected}:${range}`}
              indicators={ind}
              intraday={range === "1d" || range === "5d" || range === "1m"}
              height={ind.rsi ? 500 : 440}
              focus={hoverInd}
            />
            {detail.status === "carregando" && <p className="px-3 text-xs text-muted">Carregando gráfico…</p>}
            {detail.status === "offline" && <p className="px-3 text-xs text-down">{detail.error}</p>}
          </div>
        </Card>

        {/* Mapa de calor */}
        <Card className="self-start p-3 xl:col-span-7">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold">Mapa de calor · variação do dia</h2>
            <span className="text-[10px] text-muted">clique para abrir no gráfico</span>
          </div>
          <Heatmap
            items={filtered.map(({ a }) => ({
              id: a.symbol,
              label: a.display,
              change: a.changePct,
              changeText: signedPct(a.changePct),
              title: `${a.name}: ${signedPct(a.changePct)}`,
            }))}
            selected={selected}
            onSelect={setSelected}
            scale={4}
            legend={["-4%", "+4%"]}
          />
        </Card>

        {/* Sinal + maiores altas/baixas */}
        <div className="space-y-3 xl:col-span-5">
          {sel && (
            <Card className="p-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Sinal · {sel.a.display}</h2>
                <div className="flex items-center gap-2">
                  <span className={`text-xs ${sel.s.status === "destaque" ? "text-up" : sel.s.status === "alerta" ? "text-down" : "text-muted"}`}>
                    {STATUS_LABEL[sel.s.status]}
                  </span>
                  <ScorePill score={sel.s.score} status={sel.s.status} />
                </div>
              </div>
              <div className="mt-2 flex h-1.5 overflow-hidden rounded bg-card2">
                {sel.s.components.map((c, i) => (
                  <div
                    key={c.key}
                    title={`${c.label}: ${c.points.toFixed(0)} pts`}
                    style={{ width: `${c.points}%`, opacity: 1 - i * 0.13 }}
                    className={sel.s.status === "alerta" ? "bg-down" : "bg-up"}
                  />
                ))}
              </div>
              <ul className="mt-2 space-y-1 text-xs">
                {sel.s.alerts.map((x) => (
                  <li key={x} className="text-down">▼ {x}</li>
                ))}
                {sel.s.reasons.map((x) => (
                  <li key={x} className="text-text/80">• {x}</li>
                ))}
              </ul>
              <Link href={`/bolsa/ativo/${encodeURIComponent(sel.a.symbol)}`} className="mt-2 inline-block text-xs text-up hover:underline">
                Análise completa →
              </Link>
            </Card>
          )}

          <div className="grid grid-cols-2 gap-3">
            {[
              { title: "Maiores altas", list: gainers, tone: "text-up" },
              { title: "Maiores baixas", list: losers, tone: "text-down" },
            ].map((box) => (
              <Card key={box.title} className="p-3">
                <h2 className={`mb-2 text-xs font-semibold uppercase tracking-wider ${box.tone}`}>{box.title}</h2>
                {box.list.length === 0 && <p className="text-xs text-muted">Nenhuma hoje.</p>}
                <ul className="focus-group space-y-1">
                  {box.list.map((r) => (
                    <li key={r.a.symbol} className="focus-item">
                      <button
                        type="button"
                        onClick={() => setSelected(r.a.symbol)}
                        className="flex w-full items-center justify-between rounded px-1 py-0.5 text-xs hover:bg-card2"
                      >
                        <span className="num font-semibold">{r.a.display}</span>
                        <span className={`num ${r.a.changePct >= 0 ? "text-up" : "text-down"}`}>{signedPct(r.a.changePct)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>

          {sel && <AiExplain area="bolsa" id={sel.a.symbol} settings={settings} />}
        </div>
      </div>

      <p className="text-[11px] text-muted">
        Fonte: Yahoo Finance. B3 com atraso de até 15 min; EUA e cripto perto do tempo real. Indicadores da tabela usam candles diários.
      </p>
    </div>
  );
}
