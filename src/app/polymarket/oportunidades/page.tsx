"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { divergingBg } from "@/components/analise/charts";
import { Termo } from "@/components/Termo";
import { Card, LiveBadge } from "@/components/ui";
import { usePolling, useStored } from "@/lib/client/hooks";
import { usePolySettings } from "@/lib/client/settings";
import { LeadPicker } from "@/components/LeadPicker";
import { leadOf, pickLongshots } from "@/lib/picks";
import type { ArbOpportunity } from "@/lib/polymarket/arbitragem";
import type { PolyBacktest, RuleStat } from "@/lib/polymarket/backtest";
import type { PolyMarket } from "@/lib/polymarket/types";

const pc = (x: number | null | undefined, d = 1) => (x == null || !Number.isFinite(x) ? "–" : `${x > 0 ? "+" : ""}${(x * 100).toFixed(d)}%`);
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const H_LABEL: Record<number, string> = { 168: "7 dias antes", 72: "3 dias antes", 24: "1 dia antes", 6: "6 horas antes" };

interface ArbResp {
  checked: number;
  opportunities: ArbOpportunity[];
  cdiAnnual: number | null;
  at: number;
}

/** Fração de Kelly: quanto da banca apostar quando a chance real é `p` e o preço é `price`. */
function kelly(p: number, price: number) {
  const b = 1 / price - 1;
  return Math.max(0, (b * p - (1 - p)) / b);
}

export default function OportunidadesPage() {
  const bt = usePolling<PolyBacktest>("/api/polymarket/estrategias", 6 * 60 * 60_000);
  const arb = usePolling<ArbResp>("/api/polymarket/arbitragem", 60_000);
  const live = usePolling<{ markets: PolyMarket[]; at: number }>("/api/polymarket/markets", 30_000);
  const [settings] = usePolySettings();
  const [banca, setBanca] = useStored<number>("radar:poly:banca", 1000);
  const [antecedencia, setAntecedencia] = useStored<string>("radar:poly:antecedencia", "qualquer");
  const lead = leadOf(antecedencia);

  const best = useMemo(() => {
    if (!bt.data) return null;
    let top: { rule: PolyBacktest["rules"][number]; s: RuleStat } | null = null;
    for (const rule of bt.data.rules) for (const s of rule.stats) if (s.n >= 100 && (!top || s.ciLow > top.s.ciLow)) top = { rule, s };
    return top;
  }, [bt.data]);

  const longshot = bt.data?.rules.find((r) => r.key === "azarao");
  const ls168 = longshot?.stats.find((s) => s.h === 168);
  const fav = bt.data?.rules.find((r) => r.key === "fav70")?.stats.find((s) => s.h === 24);
  // Kelly com a taxa de acerto histórica, usando só 1/4 dela (a estimativa é incerta).
  const fullKelly = ls168 ? kelly(ls168.winRate, ls168.avgPrice) : 0;
  const perBet = Math.min(0.02, fullKelly / 4);

  const now = Date.now();
  const picks = useMemo(
    () => (live.data ? pickLongshots(live.data.markets, settings, { minDays: lead.minDays, maxDays: lead.maxDays, n: 12, now }) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [live.data, settings, lead],
  );

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header>
        <h1 className="text-xl font-semibold">
          <span className="text-poly">◆</span> Oportunidades no Polymarket
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          O que funcionou de verdade em mercados já resolvidos, as apostas de agora que seguem essa regra, quanto apostar em cada uma e um radar de arbitragem
          (lucro garantido).
        </p>
      </header>

      {/* Conclusões */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Insight title="Melhor regra testada" tone="poly" value={best ? `${best.rule.label.split(" (")[0]}, ${H_LABEL[best.s.h]}` : "…"}>
          {best && (
            <>
              {pc(best.s.roi)} por aposta (margem de erro {pc(best.s.ciLow, 0)} a {pc(best.s.ciHigh, 0)}) em {best.s.n} mercados. Acertou {pc(best.s.winRate, 0).replace("+", "")} das vezes.
            </>
          )}
        </Insight>
        <Insight title="Favoritos (70–90%)" tone={fav && fav.roi < 0 ? "down" : "up"} value={fav ? `${pc(fav.roi)} por aposta` : "…"}>
          Comprar o provável perdeu dinheiro: o preço já cobra caro pela segurança.
        </Insight>
        <Insight title="Quanto apostar por mercado" tone="warn" value={ls168 ? `${(perBet * 100).toFixed(1)}% da banca` : "…"}>
          ¼ do critério de Kelly com a taxa de acerto histórica. Com {brl(banca)}: até {brl(banca * perBet)} por aposta, em pelo menos 10 mercados diferentes.
        </Insight>
        <Insight
          title="Arbitragem agora"
          tone={arb.data?.opportunities.some((o) => o.guaranteed && (o.annual ?? 0) > (arb.data?.cdiAnnual ?? 0)) ? "up" : "text"}
          value={arb.data ? `${arb.data.opportunities.filter((o) => o.guaranteed).length} garantidas` : "…"}
        >
          {arb.data ? `Em ${arb.data.checked} eventos com vários resultados. Quase sempre o ganho ao ano fica abaixo do CDI.` : "Verificando…"}
        </Insight>
      </section>

      <StrategyTable data={bt.data} error={bt.error} />

      {/* Apostas de agora */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Agora: azarões ({lead.label.replace(" (melhor no teste)", "")})</h2>
            <p className="text-xs text-muted">
              Seguem a melhor regra do teste. Cada um perde na maioria das vezes; o resultado vem de fazer várias apostas pequenas. Spread até 4¢ e <Termo k="liquidez" /> mínima
              das configurações. Em jogos, conta o horário de início da partida.
            </p>
            <LeadPicker value={antecedencia} onChange={setAntecedencia} className="mt-2" />
          </div>
          <label className="text-xs text-muted">
            Sua banca (R$){" "}
            <input
              className="num ml-1 w-24 rounded border border-line bg-card2 px-2 py-1 text-sm text-text"
              inputMode="numeric"
              value={banca}
              onChange={(e) => setBanca(Number(e.target.value.replace(/\D/g, "")) || 0)}
            />
          </label>
        </div>
        {!live.data ? (
          <p className="p-4 text-sm text-muted">Carregando mercados…</p>
        ) : picks.length === 0 ? (
          <p className="p-4 text-sm text-muted">Nenhum mercado se encaixa na regra agora. Isso é normal: volte mais tarde.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-card2 text-[10px] uppercase tracking-wider text-muted">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Mercado</th>
                <th className="px-2 py-2 text-left font-medium">Apostar em</th>
                <th className="px-2 py-2 text-right font-medium">Preço</th>
                <th className="px-2 py-2 text-right font-medium">Começa / acontece em</th>
                <th className="px-2 py-2 text-right font-medium">Apostando {brl(banca * perBet || 10)}</th>
              </tr>
            </thead>
            <tbody className="focus-group">
              {picks.map((x) => {
                const stake = banca * perBet || 10;
                const name = x.side === "sim" ? x.m.outcomes[0] ?? "Sim" : x.m.outcomes[1] ?? "Não";
                return (
                  <tr key={x.m.id} className="focus-item border-b border-line/50">
                    <td className="max-w-[24rem] px-3 py-2">
                      <Link href={`/polymarket/mercado/${x.m.id}`} className="line-clamp-2 hover:underline">{x.m.question}</Link>
                      <div className="text-[11px] text-muted">{x.m.category}</div>
                    </td>
                    <td className="px-2 font-semibold">“{name}”</td>
                    <td className="num px-2 text-right">{Math.round(x.price * 100)}¢</td>
                    <td className="num px-2 text-right text-muted">{x.days < 1 / 24 ? `${Math.round(x.days * 1440)} min` : x.days < 2 ? `${Math.round(x.days * 24)} h` : `${x.days.toFixed(1)} dias`}{x.m.gameStart ? " (jogo)" : ""}</td>
                    <td className="num px-2 text-right">
                      <span className="text-up">{brl(stake / x.price)}</span> <span className="text-xs text-muted">se acertar</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <ArbTable data={arb.data} status={arb.status} updatedAt={arb.updatedAt} error={arb.error} />

      <p className="text-xs text-muted">
        Teste com mercados encerrados, preço comprado 1¢ acima (spread) e segurado até o resultado. Mercados do mesmo evento andam juntos, então a margem de erro real é maior que a mostrada.
        Foram testadas várias regras: com tantas tentativas, uma pode parecer boa por sorte. Use valores pequenos e acompanhe na carteira de teste antes de usar dinheiro de verdade.
      </p>
    </div>
  );
}

function Insight({ title, value, tone = "text", children }: { title: string; value: string; tone?: "up" | "down" | "warn" | "text" | "poly"; children: React.ReactNode }) {
  const c = { up: "text-up", down: "text-down", warn: "text-warn", text: "text-text", poly: "text-poly" }[tone];
  return (
    <Card className="p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">{title}</div>
      <div className={`mt-1 text-base font-semibold leading-tight ${c}`}>{value}</div>
      <div className="mt-1 text-xs text-muted">{children}</div>
    </Card>
  );
}

/** Regras × prazos. Passar o mouse destaca a linha e a coluna. */
function StrategyTable({ data, error }: { data: PolyBacktest | null; error: string | null }) {
  const [hover, setHover] = useState<{ r: string; h: number } | null>(null);
  if (!data) return <Card className="p-8 text-center text-sm text-muted">{error ?? "Testando regras em cerca de 1.100 mercados resolvidos… (na primeira vez leva cerca de 1 minuto)"}</Card>;
  const hs = data.horizons;
  const sel = hover ? data.rules.find((r) => r.key === hover.r)?.stats.find((s) => s.h === hover.h) : null;
  const dt = (t: number) => new Date(t).toLocaleDateString("pt-BR");
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold">O que deu lucro no passado</h2>
        <p className="text-xs text-muted">
          Retorno médio por aposta em {data.markets} mercados resolvidos ({dt(data.from)} a {dt(data.to)}), comprando no momento indicado e segurando até o fim.{" "}
          <span className="text-poly">★</span> = margem de erro inteira acima de zero.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-[3px] text-xs" onMouseLeave={() => setHover(null)}>
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-muted">
              <th className="px-2 text-left font-medium">Regra</th>
              {hs.map((h) => (
                <th key={h} className={`font-medium transition-opacity ${hover && hover.h !== h ? "opacity-30" : ""}`}>{H_LABEL[h]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rules.map((r) => (
              <tr key={r.key}>
                <td className={`px-2 py-1 transition-opacity ${hover && hover.r !== r.key ? "opacity-30" : ""}`} title={r.desc}>
                  {r.label}
                </td>
                {hs.map((h) => {
                  const s = r.stats.find((x) => x.h === h)!;
                  const lit = !hover || hover.r === r.key || hover.h === h;
                  const sig = s.n >= 30 && s.ciLow > 0;
                  return (
                    <td key={h} className="p-0">
                      <div
                        onMouseEnter={() => setHover({ r: r.key, h })}
                        className={`num relative cursor-default rounded px-1 py-1.5 text-center text-white transition-[opacity,filter] ${lit ? "" : "dimmed"} ${
                          hover?.r === r.key && hover.h === h ? "ring-2 ring-poly" : ""
                        }`}
                        style={{ background: s.n < 30 ? "#1b2422" : divergingBg(s.roi, 0.3) }}
                      >
                        {s.n < 30 ? "–" : pc(s.roi, 0)}
                        {sig && <span className="absolute top-0 right-1 text-[9px] text-poly">★</span>}
                        <span className="block text-[9px] opacity-70">{s.n} apostas</span>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="num h-5 px-4 pb-2 text-[11px] text-muted">
        {sel &&
          `Acertou ${pc(sel.winRate, 0).replace("+", "")} pagando em média ${Math.round(sel.avgPrice * 100)}¢ · margem de erro ${pc(sel.ciLow, 0)} a ${pc(sel.ciHigh, 0)} · 1ª metade ${pc(
            sel.roiA,
            0,
          )}, 2ª metade ${pc(sel.roiB, 0)}`}
      </p>
    </Card>
  );
}

function ArbTable({ data, status, updatedAt, error }: { data: ArbResp | null; status: Parameters<typeof LiveBadge>[0]["status"]; updatedAt: number | null; error: string | null }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Radar de arbitragem</h2>
          <p className="max-w-3xl text-xs text-muted">
            Em eventos com vários resultados (só um acontece), comprar todos os “Sim” paga $1 no fim; comprar todos os “Não” paga n − 1. Se a soma dos preços estiver errada, o lucro é
            garantido. Mas o dinheiro fica preso até o resultado: compare o ganho ao ano com o CDI.
          </p>
        </div>
        <LiveBadge status={status} updatedAt={updatedAt} every="1 min" error={error} />
      </div>
      {!data ? (
        <p className="p-4 text-sm text-muted">Verificando eventos…</p>
      ) : data.opportunities.length === 0 ? (
        <p className="p-4 text-sm text-muted">Nenhuma distorção de preço em {data.checked} eventos agora. É o normal: robôs fecham essas brechas em segundos.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-card2 text-[10px] uppercase tracking-wider text-muted">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Evento</th>
              <th className="px-2 py-2 text-left font-medium">Comprar</th>
              <th className="px-2 py-2 text-right font-medium">Lucro</th>
              <th className="px-2 py-2 text-right font-medium">Até o resultado</th>
              <th className="px-2 py-2 text-right font-medium">Ao ano</th>
              <th className="px-3 py-2 text-right font-medium">Cabe no melhor preço</th>
            </tr>
          </thead>
          <tbody className="focus-group">
            {data.opportunities.map((o) => {
              const beatsCdi = o.annual !== null && data.cdiAnnual !== null && o.annual > data.cdiAnnual;
              return (
                <tr key={o.eventId + o.kind} className="focus-item border-b border-line/50">
                  <td className="max-w-[20rem] px-3 py-2">
                    <a href={`https://polymarket.com/event/${o.slug}`} target="_blank" rel="noreferrer" className="hover:underline">{o.title}</a>
                    <div className="text-[11px] text-muted">
                      {o.outcomes} resultados · {o.guaranteed ? <span className="text-up">lucro garantido</span> : <span className="text-warn">não garantido: podem entrar novos resultados</span>}
                    </div>
                  </td>
                  <td className="px-2 text-xs">
                    Todos os “{o.kind === "sim" ? "Sim" : "Não"}”
                    <div className="num text-[11px] text-muted">soma {o.kind === "sim" ? `asks ${o.sumAsk.toFixed(3)}` : `bids ${o.sumBid.toFixed(3)}`}</div>
                  </td>
                  <td className="num px-2 text-right font-semibold text-up">{pc(o.ret, 2)}</td>
                  <td className="num px-2 text-right text-muted">{o.days ? `${Math.round(o.days)} dias` : "–"}</td>
                  <td className={`num px-2 text-right ${beatsCdi ? "text-up" : "text-down"}`}>
                    {pc(o.annual)}
                    <div className="text-[10px] text-muted">{data.cdiAnnual !== null ? (beatsCdi ? "acima do CDI" : `CDI paga ${pc(data.cdiAnnual)}`) : ""}</div>
                  </td>
                  <td className="num px-3 text-right text-xs">
                    {o.sets === null ? "não verificado" : `${o.sets} conjuntos · US$ ${(o.profitUsd ?? 0).toFixed(2)} de lucro`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Card>
  );
}
