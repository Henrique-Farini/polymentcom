"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { AiExplain } from "@/components/AiExplain";
import { OrderBook } from "@/components/OrderBook";
import { ProbabilityChart } from "@/components/PriceChart";
import { Card, LiveBadge, ScoreBreakdown, ScorePill, Segmented, Star } from "@/components/ui";
import { usePolling, useWatchlist } from "@/lib/client/hooks";
import { usePolySettings } from "@/lib/client/settings";
import { STATUS_LABEL } from "@/lib/client/transitions";
import { money, prob, signedPts } from "@/lib/format";
import type { PolyMarketDetail } from "@/lib/polymarket/types";
import { scorePoly } from "@/lib/score/polymarket";

type Range = "1d" | "1s" | "1m" | "max";

export default function MarketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [range, setRange] = useState<Range>("1s");
  const { data, status, updatedAt, error } = usePolling<PolyMarketDetail & { at: number; stale: boolean }>(
    `/api/polymarket/market/${id}?range=${range}`,
    5_000,
  );
  const [settings] = usePolySettings();
  const watch = useWatchlist("polymarket");
  const m = data?.market;
  const s = useMemo(() => (m ? scorePoly(m, settings) : null), [m, settings]);

  return (
    <div className="space-y-4">
      <Link href="/polymarket" className="text-xs text-muted hover:text-text">
        ← Polymarket · Ranking
      </Link>

      {!m && status !== "offline" && <p className="py-10 text-center text-sm text-muted">Carregando…</p>}
      {!m && status === "offline" && <p className="rounded-lg border border-down/40 bg-down/10 p-4 text-sm">{error}</p>}

      {m && s && (
        <>
          <header className="flex flex-wrap items-start gap-4">
            {m.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.image} alt="" className="h-14 w-14 rounded-lg object-cover" />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-xs text-muted">
                <span className="rounded bg-poly/20 px-1.5 py-0.5 text-poly">{m.category}</span>
                {m.eventTitle !== m.question && <span className="truncate">{m.eventTitle}</span>}
              </div>
              <h1 className="mt-1 flex items-start gap-2 text-xl font-semibold">
                <Star on={watch.has(m.id)} onClick={() => watch.toggle(m.id)} label={m.title} />
                {m.question}
              </h1>
              <LiveBadge status={status} updatedAt={updatedAt} every="5s" error={error} />
            </div>
            <div className="text-right">
              <div className="num text-4xl font-semibold text-poly">{prob(m.probability)}</div>
              <div className="text-xs text-muted">chance de “{m.outcomes[0] ?? "Sim"}”</div>
            </div>
          </header>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="p-4 lg:col-span-2">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex gap-4 text-sm">
                  <span>
                    1h <b className={`num ${(m.change1h ?? 0) >= 0 ? "text-up" : "text-down"}`}>{signedPts(m.change1h)}</b>
                  </span>
                  <span>
                    24h <b className={`num ${(m.change24h ?? 0) >= 0 ? "text-up" : "text-down"}`}>{signedPts(m.change24h)}</b>
                  </span>
                  <span>
                    7d <b className={`num ${(m.change1w ?? 0) >= 0 ? "text-up" : "text-down"}`}>{signedPts(m.change1w)}</b>
                  </span>
                  <span className="text-muted">pts</span>
                </div>
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
              </div>
              <ProbabilityChart points={data.history} resetKey={range} />
              {data.history.length === 0 && (
                <p className="text-center text-sm text-muted">Sem histórico para este período.</p>
              )}
            </Card>

            <div className="space-y-4">
              <Card className="p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold">Score do sinal</h2>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs ${s.status === "destaque" ? "text-up" : s.status === "alerta" ? "text-down" : "text-muted"}`}>
                      {STATUS_LABEL[s.status]}
                    </span>
                    <ScorePill score={s.score} status={s.status} />
                  </div>
                </div>
                {s.alerts.length > 0 && (
                  <ul className="mb-3 space-y-1 rounded-md bg-down/10 p-2 text-xs text-down">
                    {s.alerts.map((a) => (
                      <li key={a}>▼ {a}</li>
                    ))}
                  </ul>
                )}
                <ScoreBreakdown components={s.components} accent="bg-poly" />
              </Card>

              <Card className="py-3">
                <h2 className="px-3 pb-2 text-sm font-semibold">Livro de ofertas</h2>
                {data.book && (data.book.bids.length || data.book.asks.length) ? (
                  <OrderBook bids={data.book.bids} asks={data.book.asks} />
                ) : (
                  <p className="px-3 text-xs text-muted">Livro indisponível agora.</p>
                )}
              </Card>
            </div>
          </div>

          <AiExplain area="polymarket" id={m.id} settings={settings} accent="poly" />

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="p-4">
              <h2 className="mb-2 text-sm font-semibold">Números</h2>
              <dl className="grid grid-cols-2 gap-y-2 text-sm">
                <dt className="text-muted">Volume 24h</dt>
                <dd className="num text-right">{money(m.volume24h)}</dd>
                <dt className="text-muted">Volume 7d</dt>
                <dd className="num text-right">{money(m.volume1w)}</dd>
                <dt className="text-muted">Liquidez</dt>
                <dd className="num text-right">{money(m.liquidity)}</dd>
                <dt className="text-muted">Spread</dt>
                <dd className="num text-right">{m.spread === null ? "–" : `${(m.spread * 100).toFixed(1)}¢`}</dd>
                <dt className="text-muted">Encerra</dt>
                <dd className="num text-right">{m.endDate ? new Date(m.endDate).toLocaleString("pt-BR") : "–"}</dd>
              </dl>
              <div className="mt-3 space-y-1">
                {m.outcomes.map((o, i) => (
                  <div key={o} className="flex justify-between text-sm">
                    <span>{o}</span>
                    <span className="num">{prob(m.prices[i] ?? 0)}</span>
                  </div>
                ))}
              </div>
            </Card>
            <Card className="p-4 lg:col-span-2">
              <h2 className="mb-2 text-sm font-semibold">Regras de resolução</h2>
              <p className="max-h-56 overflow-y-auto whitespace-pre-line text-xs leading-relaxed text-muted">
                {data.description || "Sem descrição."}
              </p>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
