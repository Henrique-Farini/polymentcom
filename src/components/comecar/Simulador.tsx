"use client";

import { useEffect, useMemo, useState } from "react";
import { divergingBg } from "@/components/analise/charts";
import { Termo } from "@/components/Termo";
import { Card } from "@/components/ui";
import { bumpUso } from "@/lib/client/conta";
import { usePolling } from "@/lib/client/hooks";
import { DAYS_LABEL, SIM_DAYS, SIM_STOPS, type GridCell, type SimSummary } from "@/lib/simulador";

interface SimResp {
  symbol: string;
  display: string;
  name: string;
  currency: string;
  years: number;
  days: number;
  stop: number | null;
  result: SimSummary;
  noStop: SimSummary | null;
  grid: GridCell[];
  at: number;
}

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const pc = (x: number, d = 1) => `${x > 0 ? "+" : ""}${(x * 100).toFixed(d)}%`;
const stopLabel = (s: number | null) => (s === null ? "sem stop" : `stop ${Math.round(s * 100)}%`);

const sel = "rounded-lg border border-line bg-card2 px-2.5 py-1.5 text-sm outline-none focus:border-info";

export function Simulador({
  options,
  symbol,
  onSymbol,
  valor,
  onValor,
  days,
  onDays,
  stop,
  onStop,
}: {
  options: { symbol: string; display: string; name: string }[];
  symbol: string;
  onSymbol: (s: string) => void;
  valor: number;
  onValor: (v: number) => void;
  days: number;
  onDays: (d: number) => void;
  stop: number | null;
  onStop: (s: number | null) => void;
}) {
  const url = symbol ? `/api/simulador?symbol=${encodeURIComponent(symbol)}&dias=${days}&stop=${stop ?? 0}` : null;
  const sim = usePolling<SimResp>(url, 60 * 60_000);
  useEffect(() => {
    if (url) bumpUso("simulacoes");
  }, [url]);

  const d = sim.data && sim.data.symbol === symbol && sim.data.days === days && sim.data.stop === stop ? sim.data : null;
  const r = d?.result;
  const v = (x: number) => brl(valor * (1 + x));

  return (
    <Card className="p-4">
      <h2 className="text-base font-semibold">Simulador: “E se eu tivesse investido?”</h2>
      <p className="mt-1 text-sm text-muted">
        Testa a sua regra em todos os dias dos últimos anos: compra, segura pelo prazo e vende. Com <Termo k="stop" />, sai antes se cair o limite.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-2 text-sm">
        <span>Se eu colocasse</span>
        <input
          className={`${sel} num w-28`}
          inputMode="decimal"
          value={valor}
          onChange={(e) => onValor(Math.max(0, Number(e.target.value.replace(/\D/g, "")) || 0))}
          aria-label="Valor em reais"
        />
        <span>reais em</span>
        <select className={sel} value={symbol} onChange={(e) => onSymbol(e.target.value)} aria-label="Ativo">
          {options.map((o) => (
            <option key={o.symbol} value={o.symbol}>
              {o.display} · {o.name}
            </option>
          ))}
        </select>
        <span>por</span>
        <select className={sel} value={days} onChange={(e) => onDays(Number(e.target.value))} aria-label="Prazo">
          {SIM_DAYS.map((x) => (
            <option key={x} value={x}>{DAYS_LABEL[x]}</option>
          ))}
        </select>
        <span>saindo se cair</span>
        <select className={sel} value={stop ?? 0} onChange={(e) => onStop(Number(e.target.value) || null)} aria-label="Stop loss">
          {SIM_STOPS.map((s) => (
            <option key={s ?? 0} value={s ?? 0}>{s === null ? "nunca (sem stop)" : `${Math.round(s * 100)}%`}</option>
          ))}
        </select>
      </div>

      {!d && <p className="mt-6 text-sm text-muted">{sim.error ? `Não deu para simular: ${sim.error}` : "Calculando com o histórico…"}</p>}

      {d && r && (
        <div className="mt-5 space-y-5">
          <p className="text-sm text-muted">
            Em <b className="text-text">{r.n.toLocaleString("pt-BR")} vezes</b> nos últimos {d.years} anos (começando em cada dia de pregão), com {brl(valor)} em {d.display} por {DAYS_LABEL[days] ?? `${days} pregões`}, {stopLabel(stop)}:
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Big label="Terminou no lucro" value={`${Math.round(r.winRate * 100)}% das vezes`} tone={r.winRate >= 0.5 ? "up" : "down"} sub={`${Math.round((1 - r.winRate) * 100)}% das vezes terminou no prejuízo`} />
            <Big label="Resultado típico (mediana)" value={v(r.median)} tone={r.median >= 0 ? "up" : "down"} sub={`${pc(r.median)} · média ${pc(r.mean)}`} />
            <Big label="Nos 10% piores casos" value={`até ${v(r.p10)}`} tone="down" sub={`pior de todos: ${v(r.worst)} (${pc(r.worst)})`} />
            <Big label="Nos 10% melhores casos" value={`${v(r.p90)} ou mais`} tone="up" sub={`melhor de todos: ${v(r.best)} (${pc(r.best)})`} />
          </div>

          {stop !== null && (
            <p className="rounded-lg border border-line bg-card2 px-3 py-2 text-sm text-muted">
              O stop disparou em <b className="text-text">{Math.round(r.stopRate * 100)}%</b> das vezes.
              {r.gapRate > 0.005 && (
                <>
                  {" "}Em <b className="text-warn">{Math.round(r.gapRate * 100)}%</b> o preço já abriu abaixo do stop, e a perda passou dos {Math.round(stop * 100)}%.
                </>
              )}
              {d.noStop && (
                <>
                  {" "}Sem stop, teria terminado no lucro em <b className="text-text">{Math.round(d.noStop.winRate * 100)}%</b> das vezes, com resultado típico de {v(d.noStop.median)} e pior caso de {v(d.noStop.worst)}.
                </>
              )}
            </p>
          )}

          <Histogram s={r} valor={valor} />
          <Grid grid={d.grid} days={days} stop={stop} onPick={(dd, ss) => { onDays(dd); onStop(ss); }} />

          <p className="text-[11px] text-muted">
            Passado não garante futuro. Não inclui corretagem, impostos nem dividendos{d.currency === "USD" ? ", nem a variação do dólar (ativo cotado em dólar)" : ""}.
          </p>
        </div>
      )}
    </Card>
  );
}

function Big({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: "up" | "down" }) {
  return (
    <div className="rounded-lg border border-line bg-card2 p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className={`num mt-1 text-xl font-semibold ${tone === "up" ? "text-up" : "text-down"}`}>{value}</div>
      <div className="num mt-0.5 text-[11px] text-muted">{sub}</div>
    </div>
  );
}

/** Distribuição dos resultados. Passar o mouse destaca uma faixa e escurece as outras. */
function Histogram({ s, valor }: { s: SimSummary; valor: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...s.hist.map((b) => b.n)) || 1;
  const h = hover !== null ? s.hist[hover] : null;
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">Como os resultados se espalharam</h3>
        <span className="num text-xs text-muted">
          {h
            ? `${h.n} vezes (${((h.n / s.n) * 100).toFixed(1)}%): terminou entre ${brl(valor * (1 + h.lo))} e ${brl(valor * (1 + h.hi))}`
            : "Passe o mouse nas barras"}
        </span>
      </div>
      <div className="focus-group flex h-36 items-end gap-[2px]" onMouseLeave={() => setHover(null)}>
        {s.hist.map((b, i) => {
          const mid = (b.lo + b.hi) / 2;
          return (
            <div
              key={i}
              className="focus-item flex h-full flex-1 cursor-default items-end"
              onMouseEnter={() => setHover(i)}
              aria-label={`${pc(b.lo)} a ${pc(b.hi)}: ${b.n} vezes`}
            >
              <div className={`w-full rounded-t-[3px] ${mid >= 0 ? "bg-up" : "bg-down"}`} style={{ height: `${Math.max(2, (b.n / max) * 100)}%` }} />
            </div>
          );
        })}
      </div>
      <div className="num mt-1 flex justify-between text-[10px] text-muted">
        <span>{pc(s.hist[0]?.lo ?? 0, 0)}</span>
        <span>0%</span>
        <span>{pc(s.hist[s.hist.length - 1]?.hi ?? 0, 0)}</span>
      </div>
    </div>
  );
}

/** Todas as combinações prazo × stop. Passar o mouse destaca a linha e a coluna; clicar usa a combinação. */
function Grid({ grid, days, stop, onPick }: { grid: GridCell[]; days: number; stop: number | null; onPick: (d: number, s: number | null) => void }) {
  const [hover, setHover] = useState<GridCell | null>(null);
  const { best, safest } = useMemo(() => {
    const ok = grid.filter((c) => c.n >= 100);
    return {
      best: [...ok].sort((a, b) => b.mean - a.mean)[0],
      // Prazos curtos sempre perdem menos; compara só dentro do prazo escolhido.
      safest: ok.filter((c) => c.days === days).sort((a, b) => b.p10 - a.p10)[0],
    };
  }, [grid, days]);
  const cell = (d: number, s: number | null) => grid.find((c) => c.days === d && c.stop === s);
  const lit = (d: number, s: number | null) => !hover || hover.days === d || hover.stop === s;

  return (
    <div>
      <h3 className="text-sm font-semibold">Qual prazo e stop funcionaram melhor neste ativo</h3>
      <p className="mb-2 text-xs text-muted">
        Retorno médio de cada combinação no histórico. <span className="text-warn">★</span> maior retorno médio ·{" "}
        <span className="text-info">◆</span> stop que mais protegeu no prazo escolhido (menor perda nos 10% piores casos). Clique para simular.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-[3px] text-xs" onMouseLeave={() => setHover(null)}>
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-muted">
              <th className="text-left font-medium">Prazo</th>
              {SIM_STOPS.map((s) => (
                <th key={s ?? 0} className={`font-medium transition-opacity ${hover && hover.stop !== s ? "opacity-30" : ""}`}>
                  {s === null ? "Sem stop" : `${Math.round(s * 100)}%`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SIM_DAYS.map((d) => (
              <tr key={d}>
                <th className={`whitespace-nowrap pr-2 text-left font-medium text-muted transition-opacity ${hover && hover.days !== d ? "opacity-30" : ""}`}>{DAYS_LABEL[d]}</th>
                {SIM_STOPS.map((s) => {
                  const c = cell(d, s);
                  if (!c) return <td key={s ?? 0} className="text-center text-muted">–</td>;
                  const current = d === days && s === stop;
                  return (
                    <td key={s ?? 0} className="p-0">
                      <button
                        type="button"
                        onMouseEnter={() => setHover(c)}
                        onFocus={() => setHover(c)}
                        onClick={() => onPick(d, s)}
                        className={`num relative w-full rounded px-1 py-1.5 text-center text-white transition-[opacity,filter] ${lit(d, s) ? "" : "dimmed"} ${
                          current ? "ring-2 ring-white" : ""
                        } ${hover === c ? "ring-2 ring-info" : ""}`}
                        style={{ background: divergingBg(c.mean, 0.06) }}
                        title={`${DAYS_LABEL[d]}, ${stopLabel(s)}: média ${pc(c.mean)}, lucro em ${Math.round(c.winRate * 100)}% das vezes, 10% piores até ${pc(c.p10)}`}
                      >
                        {pc(c.mean)}
                        {c === best && <span className="absolute top-0 right-0.5 text-[9px] text-warn">★</span>}
                        {c === safest && <span className="absolute top-0 left-0.5 text-[9px] text-info">◆</span>}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="num mt-1 h-4 text-[11px] text-muted">
        {hover &&
          `${DAYS_LABEL[hover.days]}, ${stopLabel(hover.stop)}: lucro em ${Math.round(hover.winRate * 100)}% das vezes · mediana ${pc(hover.median)} · 10% piores até ${pc(hover.p10)}${
            hover.stop !== null ? ` · stop disparou em ${Math.round(hover.stopRate * 100)}%` : ""
          }`}
      </p>
    </div>
  );
}
