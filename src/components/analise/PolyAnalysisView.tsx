"use client";

import { useMemo } from "react";
import { Card } from "@/components/ui";
import type { PolyAnalysis } from "@/lib/analise/types";
import { money } from "@/lib/format";
import type { PolyMarket } from "@/lib/polymarket/types";
import { median } from "@/lib/stats";
import { scorePoly } from "@/lib/score/polymarket";
import type { PolySettings } from "@/lib/score/types";
import { CalibrationChart, divergingBg, pct } from "./charts";

function Insight({ title, value, detail, tone = "text" }: { title: string; value: React.ReactNode; detail: React.ReactNode; tone?: "up" | "down" | "warn" | "text" | "poly" }) {
  const c = { up: "text-up", down: "text-down", warn: "text-warn", text: "text-text", poly: "text-poly" }[tone];
  return (
    <Card className="p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">{title}</div>
      <div className={`num mt-1 text-lg font-semibold leading-tight ${c}`}>{value}</div>
      <div className="mt-1 text-xs text-muted">{detail}</div>
    </Card>
  );
}

export function PolyAnalysisView({ data, live, settings }: { data: PolyAnalysis; live: PolyMarket[] | null; settings: PolySettings }) {
  const ins = useMemo(() => {
    const significant = data.buckets
      .filter((b) => b.n >= 15 && (b.avgPrice < b.ciLow || b.avgPrice > b.ciHigh))
      .sort((a, b) => Math.abs(b.edgePts) - Math.abs(a.edgePts));
    const fav = data.buckets.filter((b) => b.lo >= 0.65);
    const long = data.buckets.filter((b) => b.hi <= 0.35 && b.lo >= 0.05);
    const wavg = (bs: typeof data.buckets) => {
      const n = bs.reduce((s, b) => s + b.n, 0);
      return n ? { roi: bs.reduce((s, b) => s + b.roi * b.n, 0) / n, n } : null;
    };
    // Só tira conclusão por categoria com amostra razoável.
    const cats = data.categories.filter((c) => c.nFavorites >= 30);
    const bestCatFav = [...cats].sort((a, b) => (b.roiFavorites ?? -9) - (a.roiFavorites ?? -9))[0];
    const mostAccurate = [...data.categories].filter((c) => c.markets >= 30).sort((a, b) => a.brier - b.brier)[0];
    return { significant, fav: wavg(fav), long: wavg(long), bestCatFav, mostAccurate };
  }, [data]);

  const liveStats = useMemo(() => {
    if (!live) return null;
    const now = Date.now();
    const scored = live.map((m) => ({ m, s: scorePoly(m, settings, now) }));
    const cats = new Map<string, typeof scored>();
    for (const x of scored) cats.set(x.m.category, [...(cats.get(x.m.category) ?? []), x]);
    const rows = [...cats.entries()]
      .map(([category, xs]) => ({
        category,
        n: xs.length,
        volume: xs.reduce((s, x) => s + x.m.volume24h, 0),
        medLiq: median(xs.map((x) => x.m.liquidity)),
        medSpread: median(xs.map((x) => x.m.spread ?? NaN).filter(Number.isFinite)),
        avgMove: xs.reduce((s, x) => s + Math.abs(x.m.change24h ?? 0), 0) / xs.length,
        destaque: xs.filter((x) => x.s.status === "destaque").length / xs.length,
        alerta: xs.filter((x) => x.s.status === "alerta").length / xs.length,
      }))
      .sort((a, b) => b.volume - a.volume);
    const hist = Array.from({ length: 10 }, (_, i) => live.filter((m) => m.probability >= i / 10 && m.probability < (i + 1) / 10 + (i === 9 ? 0.001 : 0)).length);
    return { rows, hist };
  }, [live, settings]);

  const brierPct = (1 - data.brier / 0.25) * 100;

  return (
    <div className="space-y-4">
      <section>
        <h2 className="mb-2 text-sm font-semibold">Principais conclusões dos números</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Insight
            title="Quão bem o Polymarket acerta"
            value={`${brierPct.toFixed(0)}% melhor que chute`}
            tone="poly"
            detail={<>Brier {data.brier.toFixed(3)} em {data.markets} mercados resolvidos (0 = perfeito; 0,25 = chutar 50%). Preço medido {data.hoursBefore}h antes de encerrar.</>}
          />
          {ins.fav && (
            <Insight
              title="Comprar favoritos (preço ≥ 65%)"
              value={`${pct(ins.fav.roi)} por aposta`}
              tone={ins.fav.roi >= 0 ? "up" : "down"}
              detail={<>Retorno médio de {ins.fav.n} casos segurando até o fim, sem taxas nem spread.</>}
            />
          )}
          {ins.long && (
            <Insight
              title="Comprar azarões (preço 5–35%)"
              value={`${pct(ins.long.roi)} por aposta`}
              tone={ins.long.roi >= 0 ? "up" : "down"}
              detail={<>Retorno médio de {ins.long.n} casos. Ganha pouco nas vezes, mas paga muito quando acerta: resultado varia muito.</>}
            />
          )}
          <Insight
            title="Faixa de preço com desvio real"
            value={ins.significant[0] ? `${ins.significant[0].label}: ${ins.significant[0].edgePts > 0 ? "+" : ""}${ins.significant[0].edgePts.toFixed(1)} pts` : "Nenhuma"}
            tone={ins.significant[0] ? (ins.significant[0].edgePts > 0 ? "up" : "down") : "text"}
            detail={
              ins.significant[0] ? (
                <>
                  Acertou {pct(ins.significant[0].hitRate, 0, false)} pagando {pct(ins.significant[0].avgPrice, 0, false)}, fora da margem de erro ({ins.significant[0].n} casos).
                </>
              ) : (
                <>Em todas as faixas, a diferença entre preço e acerto cabe na margem de erro: o preço já reflete bem a chance.</>
              )
            }
          />
          {ins.mostAccurate && (
            <Insight
              title="Categoria mais precisa"
              value={ins.mostAccurate.category}
              detail={<>Brier {ins.mostAccurate.brier.toFixed(3)} em {ins.mostAccurate.markets} mercados: preços dessa categoria erraram menos.</>}
            />
          )}
          {ins.bestCatFav && (
            <Insight
              title="Favoritos que mais renderam (por categoria)"
              value={`${ins.bestCatFav.category} ${pct(ins.bestCatFav.roiFavorites)}`}
              tone={(ins.bestCatFav.roiFavorites ?? 0) >= 0 ? "up" : "down"}
              detail={<>{ins.bestCatFav.nFavorites} casos com preço ≥ 70%.</>}
            />
          )}
          {liveStats?.rows[0] && (
            <Insight
              title="Onde está o dinheiro agora"
              value={liveStats.rows[0].category}
              detail={<>{money(liveStats.rows[0].volume)} negociados em 24h em {liveStats.rows[0].n} mercados abertos.</>}
            />
          )}
          {liveStats && (
            <Insight
              title="Mais oportunidades pelo score agora"
              value={[...liveStats.rows].filter((r) => r.n >= 5).sort((a, b) => b.destaque - a.destaque)[0]?.category ?? "–"}
              tone="up"
              detail={<>Categoria com maior fração de mercados “em destaque” (mín. 5 mercados).</>}
            />
          )}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="p-4">
          <h2 className="text-sm font-semibold">O preço acerta? Calibração histórica</h2>
          <p className="mb-2 text-xs text-muted">
            {data.markets} mercados resolvidos nos últimos {data.windowDays} dias (volume ≥ $10K). Para cada um, o preço {data.hoursBefore}h antes do fim contra o que aconteceu. Os dois lados (Sim e Não) entram.
          </p>
          <CalibrationChart buckets={data.buckets} />
        </Card>
        <Card className="overflow-hidden">
          <div className="border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold">Retorno por faixa de preço</h2>
            <p className="text-xs text-muted">Quanto rendeu, em média, comprar a ação nesse preço e segurar até o resultado. Sem taxas e sem spread.</p>
          </div>
          <table className="w-full text-xs">
            <thead className="bg-card2 text-[10px] uppercase tracking-wider text-muted">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Faixa</th>
                <th className="px-2 py-2 text-right font-medium">Casos</th>
                <th className="px-2 py-2 text-right font-medium">Preço médio</th>
                <th className="px-2 py-2 text-right font-medium">Acertou</th>
                <th className="px-2 py-2 text-right font-medium" title="Margem de erro de 95%">Margem</th>
                <th className="px-2 py-2 text-right font-medium">Diferença</th>
                <th className="px-3 py-2 text-right font-medium">Retorno</th>
              </tr>
            </thead>
            <tbody className="focus-group">
              {data.buckets.map((b) => {
                const sig = b.avgPrice < b.ciLow || b.avgPrice > b.ciHigh;
                return (
                  <tr key={b.label} className="focus-item border-b border-line/50">
                    <td className="num px-3 py-1.5 font-semibold">{b.label}</td>
                    <td className={`num px-2 text-right ${b.n < 30 ? "text-warn" : "text-muted"}`} title={b.n < 30 ? "Amostra pequena" : undefined}>{b.n}</td>
                    <td className="num px-2 text-right">{pct(b.avgPrice, 1, false)}</td>
                    <td className="num px-2 text-right">{pct(b.hitRate, 1, false)}</td>
                    <td className="num px-2 text-right text-muted">{pct(b.ciLow, 0, false)}–{pct(b.ciHigh, 0, false)}</td>
                    <td className="num px-2 text-right">
                      {b.edgePts > 0 ? "+" : ""}
                      {b.edgePts.toFixed(1)} pts {sig && <span className="text-warn" title="Fora da margem de erro">●</span>}
                    </td>
                    <td className="num px-3 text-right">
                      <span className="rounded px-1.5 py-0.5" style={{ background: divergingBg(b.roi, 0.3) }}>{pct(b.roi)}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="px-4 py-2 text-[11px] text-muted">
            <span className="text-warn">●</span> = diferença fora da margem de erro (estatisticamente relevante). Casos em laranja = amostra pequena (menos de 30).
          </p>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">Histórico por categoria</h2>
          <p className="text-xs text-muted">Mercados resolvidos. Retorno = comprar e segurar até o fim, sem taxas.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-card2 text-[10px] uppercase tracking-wider text-muted">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Categoria</th>
                <th className="px-2 py-2 text-right font-medium">Mercados</th>
                <th className="px-2 py-2 text-right font-medium" title="Erro médio da probabilidade. Menor = preços mais precisos">Brier</th>
                <th className="px-2 py-2 text-right font-medium">Favoritos (≥70%)</th>
                <th className="px-3 py-2 text-right font-medium">Azarões (≤30%)</th>
              </tr>
            </thead>
            <tbody className="focus-group">
              {data.categories.map((c) => (
                <tr key={c.category} className="focus-item border-b border-line/50">
                  <td className="px-3 py-1.5 font-medium">{c.category}</td>
                  <td className="num px-2 text-right text-muted">{c.markets}</td>
                  <td className="num px-2 text-right">{c.brier.toFixed(3)}</td>
                  <td className="num px-2 text-right">
                    <span className="rounded px-1.5 py-0.5" style={{ background: divergingBg(c.roiFavorites, 0.2) }}>{pct(c.roiFavorites)}</span>
                    <span className={`ml-1 ${c.nFavorites < 30 ? "text-warn" : "text-muted"}`}>({c.nFavorites})</span>
                  </td>
                  <td className="num px-3 text-right">
                    <span className="rounded px-1.5 py-0.5" style={{ background: divergingBg(c.roiLongshots, 0.6) }}>{pct(c.roiLongshots)}</span>
                    <span className={`ml-1 ${c.nLongshots < 30 ? "text-warn" : "text-muted"}`}>({c.nLongshots})</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {liveStats && (
        <div className="grid gap-4 xl:grid-cols-3">
          <Card className="overflow-hidden xl:col-span-2">
            <div className="border-b border-line px-4 py-3">
              <h2 className="text-sm font-semibold">Mercados abertos agora, por categoria</h2>
              <p className="text-xs text-muted">Liquidez e spread mostram onde é mais fácil entrar e sair. “Movimento” = variação média da probabilidade em 24h.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-card2 text-[10px] uppercase tracking-wider text-muted">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Categoria</th>
                    <th className="px-2 py-2 text-right font-medium">Abertos</th>
                    <th className="px-2 py-2 text-right font-medium">Volume 24h</th>
                    <th className="px-2 py-2 text-right font-medium">Liquidez mediana</th>
                    <th className="px-2 py-2 text-right font-medium">Spread mediano</th>
                    <th className="px-2 py-2 text-right font-medium">Movimento</th>
                    <th className="px-2 py-2 text-right font-medium">Em destaque</th>
                    <th className="px-3 py-2 text-right font-medium">Em alerta</th>
                  </tr>
                </thead>
                <tbody className="focus-group">
                  {liveStats.rows.map((r) => (
                    <tr key={r.category} className="focus-item border-b border-line/50">
                      <td className="px-3 py-1.5 font-medium">{r.category}</td>
                      <td className="num px-2 text-right text-muted">{r.n}</td>
                      <td className="num px-2 text-right">{money(r.volume)}</td>
                      <td className="num px-2 text-right">{money(r.medLiq)}</td>
                      <td className="num px-2 text-right">{Number.isFinite(r.medSpread) ? `${(r.medSpread * 100).toFixed(1)}¢` : "–"}</td>
                      <td className="num px-2 text-right">{(r.avgMove * 100).toFixed(1)} pts</td>
                      <td className="num px-2 text-right text-up">{pct(r.destaque, 0, false)}</td>
                      <td className="num px-3 text-right text-down">{pct(r.alerta, 0, false)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Card className="p-4">
            <h2 className="text-sm font-semibold">Como estão as probabilidades abertas</h2>
            <p className="mb-3 text-xs text-muted">Quantos mercados abertos em cada faixa de probabilidade.</p>
            <div className="focus-group flex h-40 items-end gap-1">
              {liveStats.hist.map((n, i) => {
                const max = Math.max(...liveStats.hist) || 1;
                return (
                  <div key={i} className="focus-item flex flex-1 flex-col items-center gap-1" title={`${i * 10}–${i * 10 + 10}%: ${n} mercados`}>
                    <span className="num text-[10px] text-muted">{n}</span>
                    <div className="w-full rounded-t bg-poly" style={{ height: `${(n / max) * 120}px` }} />
                  </div>
                );
              })}
            </div>
            <div className="mt-1 flex gap-1 text-[9px] text-muted">
              {liveStats.hist.map((_, i) => (
                <span key={i} className="flex-1 text-center">{i * 10}</span>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
