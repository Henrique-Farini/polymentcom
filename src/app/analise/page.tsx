"use client";

import { useEffect } from "react";
import { BolsaAnalysisView } from "@/components/analise/BolsaAnalysisView";
import { EstrategiasView } from "@/components/analise/EstrategiasView";
import { PolyAnalysisView } from "@/components/analise/PolyAnalysisView";
import { Card, LiveBadge, Segmented } from "@/components/ui";
import type { BolsaAnalysis, PolyAnalysis } from "@/lib/analise/types";
import { usePolling, useStored } from "@/lib/client/hooks";
import { useBolsaUniverse, usePolySettings } from "@/lib/client/settings";
import type { PolyMarket } from "@/lib/polymarket/types";

type Tab = "bolsa" | "polymarket" | "estrategias";

export default function AnalisePage() {
  const [tab, setTab] = useStored<Tab>("radar:analise:tab", "bolsa");
  const [universe, , ready] = useBolsaUniverse();
  const [polySettings] = usePolySettings();

  const bolsa = usePolling<BolsaAnalysis & { stale?: boolean }>(
    tab === "bolsa" && ready ? `/api/analise/bolsa?symbols=${encodeURIComponent(universe.join(","))}` : null,
    10 * 60_000,
  );
  const poly = usePolling<PolyAnalysis & { stale?: boolean }>(tab === "polymarket" ? "/api/analise/polymarket" : null, 30 * 60_000);
  const live = usePolling<{ markets: PolyMarket[]; at: number }>(tab === "polymarket" ? "/api/polymarket/markets" : null, 60_000);
  const cur = tab === "bolsa" ? bolsa : poly;
  // Link direto: /analise?aba=estrategias
  useEffect(() => {
    const aba = new URLSearchParams(window.location.search).get("aba");
    if (aba === "estrategias" || aba === "bolsa" || aba === "polymarket") setTab(aba);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">
            <span className="text-warn">◉</span> Análise de mercado
          </h1>
          <p className="text-sm text-muted">O que os números históricos mostram sobre onde rendeu mais e com qual risco.</p>
          {tab !== "estrategias" && <LiveBadge status={cur.status} updatedAt={cur.updatedAt} every={tab === "bolsa" ? "10 min" : "30 min"} error={cur.error} />}
        </div>
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          accent="bg-warn text-black"
          options={[
            { value: "bolsa", label: "▲ Bolsa" },
            { value: "polymarket", label: "◆ Polymarket" },
            { value: "estrategias", label: "★ Estratégias" },
          ]}
        />
      </header>

      <Card className="border-warn/30 bg-warn/5 p-3 text-xs text-muted">
        <b className="text-warn">Como ler:</b> tudo aqui é estatística do passado. Mostra o que <i>aconteceu</i>, não garante o que vai acontecer.
        Retornos não descontam taxas, impostos nem spread. Amostras pequenas aparecem marcadas: desconfie delas. Não é recomendação de investimento.
      </Card>

      {tab === "bolsa" &&
        (bolsa.data ? (
          <BolsaAnalysisView data={bolsa.data} />
        ) : (
          <Loading status={bolsa.status} error={bolsa.error} text="Baixando 5 anos de histórico de cada ativo e calculando…" />
        ))}

      {tab === "estrategias" && <EstrategiasView />}

      {tab === "polymarket" &&
        (poly.data ? (
          <PolyAnalysisView data={poly.data} live={live.data?.markets ?? null} settings={polySettings} />
        ) : (
          <Loading
            status={poly.status}
            error={poly.error}
            text="Analisando centenas de mercados já resolvidos (preço 24h antes × resultado). Na primeira vez leva cerca de 30 segundos…"
          />
        ))}
    </div>
  );
}

function Loading({ status, error, text }: { status: string; error: string | null; text: string }) {
  return status === "offline" ? (
    <div className="rounded-lg border border-down/40 bg-down/10 p-4 text-sm">{error}</div>
  ) : (
    <Card className="p-10 text-center text-sm text-muted">
      <div className="live-dot mx-auto mb-3 h-3 w-3 rounded-full bg-warn" />
      {text}
    </Card>
  );
}
