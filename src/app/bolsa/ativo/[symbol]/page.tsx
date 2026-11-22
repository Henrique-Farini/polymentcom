"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { AiExplain } from "@/components/AiExplain";
import { CandleChart } from "@/components/PriceChart";
import { Card, Flash, LiveBadge, ScoreBreakdown, ScorePill, Segmented, Star } from "@/components/ui";
import type { BolsaAssetDetail } from "@/lib/bolsa/types";
import { usePolling, useWatchlist } from "@/lib/client/hooks";
import { useBolsaSettings } from "@/lib/client/settings";
import { STATUS_LABEL } from "@/lib/client/transitions";
import { price, signedPct } from "@/lib/format";
import { scoreBolsa } from "@/lib/score/bolsa";

type Range = "1d" | "5d" | "1m" | "6m" | "1a" | "5a";

const fmt = (n: number | null, d = 2) => (n === null ? "–" : n.toLocaleString("pt-BR", { maximumFractionDigits: d, minimumFractionDigits: d }));

export default function AssetDetailPage() {
  const symbol = decodeURIComponent(useParams<{ symbol: string }>().symbol);
  const [range, setRange] = useState<Range>("6m");
  const { data, status, updatedAt, error } = usePolling<BolsaAssetDetail & { at: number; stale: boolean }>(
    `/api/bolsa/asset/${encodeURIComponent(symbol)}?range=${range}`,
    range === "1d" ? 20_000 : 60_000,
  );
  const [settings] = useBolsaSettings();
  const watch = useWatchlist("bolsa");
  const a = data?.asset;
  const s = useMemo(() => (a ? scoreBolsa(a, settings) : null), [a, settings]);

  return (
    <div className="space-y-4">
      <Link href="/bolsa" className="text-xs text-muted hover:text-text">
        ← Bolsa · Ranking
      </Link>

      {!a && status !== "offline" && <p className="py-10 text-center text-sm text-muted">Carregando…</p>}
      {!a && status === "offline" && <p className="rounded-lg border border-down/40 bg-down/10 p-4 text-sm">{error}</p>}

      {a && s && (
        <>
          <header className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-xs text-muted">
                <span className="rounded bg-up/15 px-1.5 py-0.5 text-up">{a.market}</span> {a.name}
              </div>
              <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold">
                <Star on={watch.has(a.symbol)} onClick={() => watch.toggle(a.symbol)} label={a.display} />
                {a.display}
              </h1>
              <LiveBadge status={status} updatedAt={updatedAt} every={range === "1d" ? "20s" : "60s"} error={error} />
            </div>
            <div className="text-right">
              <Flash value={a.price} className="num text-4xl font-semibold">
                {price(a.price, a.currency)}
              </Flash>
              <div className={`num text-sm ${a.changePct >= 0 ? "text-up" : "text-down"}`}>{signedPct(a.changePct)} hoje</div>
            </div>
          </header>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="p-4 lg:col-span-2">
              <div className="mb-3 flex justify-end">
                <Segmented<Range>
                  value={range}
                  onChange={setRange}
                  options={[
                    { value: "1d", label: "1D" },
                    { value: "5d", label: "5D" },
                    { value: "1m", label: "1M" },
                    { value: "6m", label: "6M" },
                    { value: "1a", label: "1A" },
                    { value: "5a", label: "5A" },
                  ]}
                />
              </div>
              <CandleChart candles={data.candles} resetKey={range} />
            </Card>

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
                  {s.alerts.map((x) => (
                    <li key={x}>▼ {x}</li>
                  ))}
                </ul>
              )}
              <ScoreBreakdown components={s.components} />
            </Card>
          </div>

          <AiExplain area="bolsa" id={a.symbol} settings={settings} />

          <Card className="p-4">
            <h2 className="mb-3 text-sm font-semibold">Indicadores (diário)</h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
              {[
                ["Média 9", fmt(a.ma9)],
                ["Média 21", fmt(a.ma21)],
                ["Média 200", fmt(a.ma200)],
                ["RSI 14", fmt(a.rsi14, 1)],
                ["MACD hist.", fmt(a.macdHist, 3)],
                ["Bollinger %B", fmt(a.percentB)],
                ["ATR", a.atrPct === null ? "–" : `${fmt(a.atrPct, 1)}%`],
                ["Volume / média", a.volRatio === null ? "–" : `${fmt(a.volRatio, 1)}x`],
                ["Máx. 52 sem.", fmt(a.high52)],
                ["Mín. 52 sem.", fmt(a.low52)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2 border-b border-line/60 pb-1">
                  <dt className="text-muted">{k}</dt>
                  <dd className="num">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </>
      )}
    </div>
  );
}
