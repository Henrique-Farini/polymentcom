"use client";

import { useMemo, useRef, useState } from "react";
import { Card, Segmented } from "@/components/ui";
import { usePolling } from "@/lib/client/hooks";
import type { BacktestResult, StrategyResult } from "@/lib/estrategia/backtest";
import { divergingBg, pct } from "./charts";

/** As 4 linhas do gráfico (cores categóricas validadas para fundo escuro, em ordem fixa). */
const LINES: { key: string; color: string; short: string }[] = [
  { key: "nova", color: "#3987e5", short: "Regra nova" },
  { key: "app", color: "#d95926", short: "Regra antiga" },
  { key: "nucleo", color: "#199e70", short: "Núcleo (ETFs)" },
  { key: "^GSPC", color: "#c98500", short: "S&P 500" },
];

export function EstrategiasView() {
  const [periodo, setPeriodo] = useState<"7" | "28">("28");
  const bt = usePolling<BacktestResult>(`/api/estrategia?perfil=arrojado&n=4&periodo=${periodo}`, 6 * 60 * 60_000);
  const d = bt.data && String(bt.data.periodDays) === periodo ? bt.data : null;

  if (!d) {
    return (
      <Card className="p-10 text-center text-sm text-muted">
        {bt.error ? bt.error : "Rodando o teste: recria cada semana dos últimos 4 anos e escolhe como cada estratégia escolheria…"}
      </Card>
    );
  }

  const by = (k: string) => d.strategies.find((s) => s.key === k);
  const nova = by("nova");
  const app = by("app");
  const appStop = by("app-stop");
  const novaStop = by("nova-stop");
  const rows = [...d.strategies].sort((a, b) => b.retRisk - a.retRisk);
  const fmtDate = (t: number) => new Date(t).toLocaleDateString("pt-BR", { month: "short", year: "numeric" });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-3xl text-sm text-muted">
          Teste de {fmtDate(d.from)} a {fmtDate(d.to)}: em cada data, cada estratégia escolhe usando só os dados até aquele dia, segura até a próxima revisão e mede o resultado.
          Custos de 0,1% por compra e por venda. Sem impostos.
        </p>
        <Segmented<"7" | "28">
          value={periodo}
          onChange={setPeriodo}
          accent="bg-warn text-black"
          options={[
            { value: "28", label: "Revisão mensal" },
            { value: "7", label: "Revisão semanal" },
          ]}
        />
      </div>

      {nova && app && (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Insight title="Regra nova × regra antiga" value={`${pct(nova.totalAfterCosts, 0)} × ${pct(app.totalAfterCosts, 0)}`} tone={nova.totalAfterCosts > app.totalAfterCosts ? "up" : "down"}>
            Total depois dos custos. Pior queda {pct(nova.maxDD, 0)} contra {pct(app.maxDD, 0)}.
          </Insight>
          <Insight title="Retorno por risco" value={`${nova.retRisk.toFixed(2)} × ${app.retRisk.toFixed(2)}`} tone={nova.retRisk > app.retRisk ? "up" : "down"}>
            Quanto cada uma rendeu por unidade de oscilação. Maior é melhor.
          </Insight>
          {appStop && novaStop && (
            <Insight title="O stop ajudou?" value={appStop.total < app.total && novaStop.total < nova.total ? "Não" : "Às vezes"} tone="warn">
              Stop 8% na regra antiga: {pct(app.total, 0)} → {pct(appStop.total, 0)}. Stop 15% na nova: {pct(nova.total, 0)} → {pct(novaStop.total, 0)}.
            </Insight>
          )}
          <Insight title="Quanto troca a cada revisão" value={`${pct(nova.turnover, 0, false)} × ${pct(app.turnover, 0, false)}`}>
            Trocar muito custa caro: cada troca paga corretagem, emolumentos e spread.
          </Insight>
        </section>
      )}

      <Card className="p-4">
        <h2 className="text-sm font-semibold">Quanto R$ 1 virou em cada estratégia</h2>
        <p className="mb-2 text-xs text-muted">Passe o mouse no gráfico para ver cada data, ou na legenda para destacar uma linha.</p>
        <EquityLines strategies={d.strategies} />
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">Todas as estratégias testadas</h2>
          <p className="text-xs text-muted">Ordenadas por retorno ÷ risco. Passe o mouse no nome para ver a descrição.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-card2 text-[10px] uppercase tracking-wider text-muted">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Estratégia</th>
                <th className="px-2 py-2 text-right font-medium">Total</th>
                <th className="px-2 py-2 text-right font-medium">Com custos</th>
                <th className="px-2 py-2 text-right font-medium">Ao ano</th>
                <th className="px-2 py-2 text-right font-medium">Volatilidade</th>
                <th className="px-2 py-2 text-right font-medium">Ret ÷ risco</th>
                <th className="px-2 py-2 text-right font-medium">Pior queda</th>
                <th className="px-2 py-2 text-right font-medium">Períodos +</th>
                <th className="px-3 py-2 text-left font-medium">Escolheria hoje</th>
              </tr>
            </thead>
            <tbody className="focus-group">
              {rows.map((s) => (
                <tr key={s.key} className={`focus-item border-b border-line/50 ${s.key === "nova" ? "bg-info/5" : ""}`}>
                  <td className="px-3 py-1.5 font-medium" title={s.desc}>
                    {s.key === "nova" && <span className="mr-1 text-info">★</span>}
                    {s.label}
                  </td>
                  <td className="num px-2 text-right">{pct(s.total, 0)}</td>
                  <td className="num px-2 text-right">
                    <span className="rounded px-1.5 py-0.5" style={{ background: divergingBg(s.totalAfterCosts, 2) }}>{pct(s.totalAfterCosts, 0)}</span>
                  </td>
                  <td className="num px-2 text-right">{pct(s.cagr)}</td>
                  <td className="num px-2 text-right">{pct(s.vol, 0, false)}</td>
                  <td className="num px-2 text-right font-semibold">{s.retRisk.toFixed(2)}</td>
                  <td className="num px-2 text-right text-down">{pct(s.maxDD, 0)}</td>
                  <td className="num px-2 text-right">{pct(s.winRate, 0, false)}</td>
                  <td className="max-w-[16rem] truncate px-3 text-muted" title={s.lastPicks.join(", ")}>
                    {s.lastPicks.length > 6 ? `${s.lastPicks.length} ativos` : s.lastPicks.map((x) => x.replace(".SA", "")).join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-2 text-[11px] text-muted">
          Cuidado: a lista de ações foi escolhida hoje e inclui vencedores conhecidos (NVDA, AMD, Bitcoin), o que favorece as estratégias de ações. Os ETFs e os índices não têm esse problema.
          4 anos é pouco e foram, na maior parte, anos de alta.
        </p>
      </Card>
    </div>
  );
}

function Insight({ title, value, tone = "text", children }: { title: string; value: string; tone?: "up" | "down" | "warn" | "text"; children: React.ReactNode }) {
  const c = { up: "text-up", down: "text-down", warn: "text-warn", text: "text-text" }[tone];
  return (
    <Card className="p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">{title}</div>
      <div className={`num mt-1 text-lg font-semibold ${c}`}>{value}</div>
      <div className="mt-1 text-xs text-muted">{children}</div>
    </Card>
  );
}

function EquityLines({ strategies }: { strategies: StrategyResult[] }) {
  const lines = useMemo(
    () => LINES.map((l) => ({ ...l, s: strategies.find((x) => x.key === l.key) })).filter((l): l is typeof l & { s: StrategyResult } => !!l.s),
    [strategies],
  );
  const [focus, setFocus] = useState<string | null>(null);
  const [hi, setHi] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  if (!lines.length) return null;
  const W = 900;
  const H = 300;
  const pad = { l: 44, r: 140, t: 10, b: 24 };
  const n = lines[0].s.equity.length;
  const all = lines.flatMap((l) => [1, ...l.s.equity.map((p) => p.v)]);
  const yMin = Math.min(...all) * 0.95;
  const yMax = Math.max(...all) * 1.03;
  const sx = (i: number) => pad.l + (i / Math.max(1, n - 1)) * (W - pad.l - pad.r);
  const sy = (v: number) => pad.t + ((yMax - v) / (yMax - yMin)) * (H - pad.t - pad.b);
  const ticks = [1, ...[1.5, 2, 2.5, 3, 3.5, 4].filter((v) => v > yMin && v < yMax)];
  // Rótulos no fim das linhas, afastados para não se sobreporem.
  const labelY = new Map<string, number>();
  [...lines]
    .map((l) => ({ k: l.key, y: sy(l.s.equity[l.s.equity.length - 1].v) }))
    .sort((a, b) => a.y - b.y)
    .reduce((prev, cur) => {
      const y = Math.max(cur.y, prev + 14);
      labelY.set(cur.k, y);
      return y;
    }, -Infinity);

  function onMove(e: React.MouseEvent) {
    const r = svg.current!.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    setHi(Math.max(0, Math.min(n - 1, Math.round(((x - pad.l) / (W - pad.l - pad.r)) * (n - 1)))));
  }

  return (
    <div className="relative">
      <div className="mb-2 flex flex-wrap gap-3 text-xs">
        {lines.map((l) => (
          <span
            key={l.key}
            className={`focus-item inline-flex cursor-default items-center gap-1.5 ${focus && focus !== l.key ? "dimmed" : ""}`}
            onMouseEnter={() => setFocus(l.key)}
            onMouseLeave={() => setFocus(null)}
          >
            <span className="h-0.5 w-4 rounded" style={{ background: l.color }} />
            {l.short}
          </span>
        ))}
      </div>
      <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" onMouseMove={onMove} onMouseLeave={() => setHi(null)} role="img" aria-label="Evolução de R$ 1 em cada estratégia">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={sy(v)} y2={sy(v)} stroke={v === 1 ? "#4b5a57" : "#1a2321"} strokeDasharray={v === 1 ? "4 4" : undefined} />
            <text x={pad.l - 6} y={sy(v) + 3} fontSize="10" fill="#7c8a87" textAnchor="end">{v.toFixed(1)}×</text>
          </g>
        ))}
        {lines.map((l) => {
          const d = l.s.equity.map((p, i) => `${i ? "L" : "M"}${sx(i).toFixed(1)},${sy(p.v).toFixed(1)}`).join("");
          const last = l.s.equity[l.s.equity.length - 1];
          const dim = focus && focus !== l.key;
          return (
            <g key={l.key} className={`focus-item ${dim ? "dimmed" : ""}`} onMouseEnter={() => setFocus(l.key)} onMouseLeave={() => setFocus(null)}>
              <path d={d} fill="none" stroke={l.color} strokeWidth={focus === l.key ? 3 : 2} />
              <path d={d} fill="none" stroke="transparent" strokeWidth={12} />
              <text x={W - pad.r + 6} y={(labelY.get(l.key) ?? sy(last.v)) + 3} fontSize="11" fill="#c9d3d1">
                {l.short} {last.v.toFixed(2)}×
              </text>
            </g>
          );
        })}
        {hi !== null && (
          <g>
            <line x1={sx(hi)} x2={sx(hi)} y1={pad.t} y2={H - pad.b} stroke="#4b5a57" />
            {lines.map((l) => l.s.equity[hi] && <circle key={l.key} cx={sx(hi)} cy={sy(l.s.equity[hi].v)} r={4} fill={l.color} stroke="#111716" strokeWidth={2} />)}
          </g>
        )}
        <text x={pad.l} y={H - 6} fontSize="10" fill="#7c8a87">{new Date(lines[0].s.equity[0].t).toLocaleDateString("pt-BR", { month: "short", year: "numeric" })}</text>
        <text x={W - pad.r} y={H - 6} fontSize="10" fill="#7c8a87" textAnchor="end">{new Date(lines[0].s.equity[n - 1].t).toLocaleDateString("pt-BR", { month: "short", year: "numeric" })}</text>
      </svg>
      {hi !== null && (
        <div className="num pointer-events-none absolute top-8 left-14 rounded-md border border-line bg-bg/95 px-2.5 py-1.5 text-[11px]">
          <div className="text-muted">{new Date(lines[0].s.equity[hi].t).toLocaleDateString("pt-BR")}</div>
          {lines.map((l) => (
            <div key={l.key} className={focus && focus !== l.key ? "opacity-40" : ""}>
              <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: l.color }} />
              {l.short}: <b>{l.s.equity[hi]?.v.toFixed(2)}×</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
