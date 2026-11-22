"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { AssetStats, BolsaAnalysis } from "@/lib/analise/types";
import { Card } from "@/components/ui";
import { divergingBg, ForwardBars, MARKET_COLOR, pct, RiskReturnScatter } from "./charts";

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MONTHS_FULL = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function Insight({ title, value, detail, tone = "text" }: { title: string; value: React.ReactNode; detail: React.ReactNode; tone?: "up" | "down" | "warn" | "text" }) {
  const c = tone === "up" ? "text-up" : tone === "down" ? "text-down" : tone === "warn" ? "text-warn" : "text-text";
  return (
    <Card className="p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">{title}</div>
      <div className={`num mt-1 text-lg font-semibold leading-tight ${c}`}>{value}</div>
      <div className="mt-1 text-xs text-muted">{detail}</div>
    </Card>
  );
}

type SortKey = keyof Pick<AssetStats, "ret1m" | "ret3m" | "ret6m" | "ret1y" | "cagr" | "vol1y" | "retRisk1y" | "mdd1y" | "beta1y" | "upDays1y" | "fromHigh">;

const COLS: { key: SortKey; label: string; title: string; fmt: (a: AssetStats) => string; bg?: (a: AssetStats) => string; lowerBetter?: boolean }[] = [
  { key: "ret1m", label: "1 mês", title: "Retorno no último mês (21 pregões)", fmt: (a) => pct(a.ret1m), bg: (a) => divergingBg(a.ret1m, 0.12) },
  { key: "ret3m", label: "3 meses", title: "Retorno em 3 meses", fmt: (a) => pct(a.ret3m), bg: (a) => divergingBg(a.ret3m, 0.25) },
  { key: "ret6m", label: "6 meses", title: "Retorno em 6 meses", fmt: (a) => pct(a.ret6m), bg: (a) => divergingBg(a.ret6m, 0.35) },
  { key: "ret1y", label: "12 meses", title: "Retorno em 12 meses", fmt: (a) => pct(a.ret1y), bg: (a) => divergingBg(a.ret1y, 0.5) },
  { key: "cagr", label: "Ao ano", title: "Retorno anualizado no período disponível (até 5 anos)", fmt: (a) => pct(a.cagr), bg: (a) => divergingBg(a.cagr, 0.3) },
  { key: "vol1y", label: "Volatil.", title: "Volatilidade anual (12 meses): quanto o preço oscila. Maior = mais risco", fmt: (a) => pct(a.vol1y, 0, false), lowerBetter: true },
  { key: "retRisk1y", label: "Ret÷Risco", title: "Retorno médio anualizado dividido pela volatilidade (12 meses). Maior = mais retorno por unidade de risco", fmt: (a) => a.retRisk1y?.toFixed(2) ?? "–", bg: (a) => divergingBg(a.retRisk1y, 1.5) },
  { key: "mdd1y", label: "Pior queda", title: "Maior queda do topo ao fundo em 12 meses", fmt: (a) => pct(a.mdd1y, 0), bg: (a) => divergingBg(a.mdd1y, 0.6), lowerBetter: false },
  { key: "beta1y", label: "Beta", title: "Sensibilidade ao índice (Ibovespa para B3, S&P 500 para o resto). 1 = anda igual ao índice", fmt: (a) => a.beta1y?.toFixed(2) ?? "–" },
  { key: "upDays1y", label: "Dias ▲", title: "% de pregões em alta nos últimos 12 meses", fmt: (a) => pct(a.upDays1y, 0, false) },
  { key: "fromHigh", label: "Da máxima", title: "Distância da máxima de 52 semanas", fmt: (a) => pct(a.fromHigh, 0), bg: (a) => divergingBg(a.fromHigh, 0.5) },
];

export function BolsaAnalysisView({ data }: { data: BolsaAnalysis }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "retRisk1y", dir: -1 });
  const [group, setGroup] = useState<"Todos" | AssetStats["market"]>("Todos");
  // Destaque ligado: passar o mouse na tabela acende o ponto no gráfico, e vice-versa.
  const [focusSym, setFocusSym] = useState<string | null>(null);
  const [focusMkt, setFocusMkt] = useState<AssetStats["market"] | null>(null);

  const eq = data.assets.filter((a) => a.market === "B3" || a.market === "EUA");
  const nextMonth = (new Date().getMonth() + 1) % 12;

  const ins = useMemo(() => {
    /** Ordena do maior para o menor valor do campo. */
    const by = <K extends keyof AssetStats>(k: K) =>
      [...eq].filter((a) => typeof a[k] === "number").sort((x, y) => (y[k] as number) - (x[k] as number));
    const bestRR = by("retRisk1y");
    const bestRet = by("ret1y");
    const bestCagr = by("cagr");
    // Queda máxima é negativa: o maior valor (mais perto de zero) é o mais defensivo.
    const defensive = by("mdd1y");
    const momentum = by("ret3m");
    const bestGroup = [...data.groups].sort((a, b) => b.medRetRisk - a.medRetRisk)[0];
    const bt = data.backtest;
    const bestTrend = [...bt.trend].sort((a, b) => b.mean - a.mean)[0];
    const worstTrend = [...bt.trend].sort((a, b) => a.mean - b.mean)[0];
    const bestRsi = [...bt.rsi].sort((a, b) => b.mean - a.mean)[0];
    const season = eq
      .map((a) => ({ a, v: a.seasonality[nextMonth], p: a.seasonalityPositive[nextMonth] }))
      .filter((x): x is { a: AssetStats; v: number; p: number } => x.v !== null && x.p !== null)
      .sort((x, y) => y.v - x.v);
    const seasonAvg = season.length ? season.reduce((s, x) => s + x.v, 0) / season.length : null;
    return { bestRR, bestRet, bestCagr, defensive, momentum, bestGroup, bestTrend, worstTrend, bestRsi, season, seasonAvg };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const rows = useMemo(
    () =>
      data.assets
        .filter((a) => group === "Todos" || a.market === group)
        .sort((x, y) => (((x[sort.key] as number | null) ?? -Infinity) - ((y[sort.key] as number | null) ?? -Infinity)) * sort.dir),
    [data, sort, group],
  );

  const names = (xs: AssetStats[], n = 3, f: (a: AssetStats) => string) => xs.slice(0, n).map((a) => `${a.display} ${f(a)}`).join(" · ");

  return (
    <div className="space-y-4">
      {/* Conclusões */}
      <section>
        <h2 className="mb-2 text-sm font-semibold">Principais conclusões dos números</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {ins.bestRR[0] && (
            <Insight
              title="Melhor retorno por risco (12m)"
              value={ins.bestRR[0].display}
              tone="up"
              detail={<>Ret÷Risco {ins.bestRR[0].retRisk1y?.toFixed(2)}. Depois: {names(ins.bestRR.slice(1), 2, (a) => a.retRisk1y?.toFixed(2) ?? "")}</>}
            />
          )}
          {ins.bestRet[0] && (
            <Insight title="Maior alta em 12 meses" value={`${ins.bestRet[0].display} ${pct(ins.bestRet[0].ret1y)}`} tone="up" detail={<>Depois: {names(ins.bestRet.slice(1), 2, (a) => pct(a.ret1y))}</>} />
          )}
          {ins.bestCagr[0] && (
            <Insight
              title="Maior retorno ao ano (longo prazo)"
              value={`${ins.bestCagr[0].display} ${pct(ins.bestCagr[0].cagr)} a.a.`}
              tone="up"
              detail={<>Em {ins.bestCagr[0].years} anos de dados. Depois: {names(ins.bestCagr.slice(1), 2, (a) => pct(a.cagr))}</>}
            />
          )}
          {ins.defensive[0] && (
            <Insight
              title="Mais defensivo (menor queda em 12m)"
              value={`${ins.defensive[0].display} ${pct(ins.defensive[0].mdd1y, 0)}`}
              detail={<>Pior queda do topo ao fundo no ano. Depois: {names(ins.defensive.slice(1), 2, (a) => pct(a.mdd1y, 0))}</>}
            />
          )}
          {ins.bestGroup && (
            <Insight
              title="Mercado com melhor retorno por risco"
              value={ins.bestGroup.market}
              detail={<>Mediana 12m {pct(ins.bestGroup.medRet1y)} com volatilidade {pct(ins.bestGroup.medVol1y, 0, false)}; {pct(ins.bestGroup.positive1y, 0, false)} dos ativos subiram.</>}
            />
          )}
          {ins.momentum[0] && (
            <Insight title="Momento mais forte (3 meses)" value={`${ins.momentum[0].display} ${pct(ins.momentum[0].ret3m)}`} tone="warn" detail={<>Depois: {names(ins.momentum.slice(1), 2, (a) => pct(a.ret3m))}</>} />
          )}
          {ins.bestTrend && (
            <Insight
              title={`Qual sinal rendeu mais (${data.backtest.horizon} pregões)`}
              value={ins.bestTrend.label}
              tone={ins.bestTrend.mean > data.backtest.baseline.mean ? "up" : "text"}
              detail={
                <>
                  Média {pct(ins.bestTrend.mean, 2)} contra {pct(data.backtest.baseline.mean, 2)} de todos os dias. Pior: {ins.worstTrend.label} ({pct(ins.worstTrend.mean, 2)}).
                </>
              }
            />
          )}
          {ins.seasonAvg !== null && (
            <Insight
              title={`Histórico de ${MONTHS_FULL[nextMonth]}`}
              value={`média ${pct(ins.seasonAvg, 1)}`}
              tone={ins.seasonAvg >= 0 ? "up" : "down"}
              detail={
                <>
                  Média das ações neste mês nos últimos anos. Melhores:{" "}
                  {ins.season
                    .slice(0, 3)
                    .map((x) => `${x.a.display} ${pct(x.v)} (${pct(x.p, 0, false)} dos anos ▲)`)
                    .join(" · ")}
                </>
              }
            />
          )}
        </div>
      </section>

      {/* Comparação por mercado */}
      <Card className="p-4">
        <h2 className="text-sm font-semibold">Onde rendeu mais: comparação por mercado (12 meses, medianas)</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-wider text-muted">
              <tr>
                <th className="py-1 text-left font-medium">Mercado</th>
                <th className="py-1 text-right font-medium">Ativos</th>
                <th className="py-1 text-right font-medium">Retorno</th>
                <th className="py-1 text-right font-medium">Volatilidade</th>
                <th className="py-1 text-right font-medium">Ret÷Risco</th>
                <th className="py-1 text-right font-medium">Pior queda</th>
                <th className="py-1 text-right font-medium">% que subiram</th>
              </tr>
            </thead>
            <tbody>
              {[...data.groups].sort((a, b) => b.medRetRisk - a.medRetRisk).map((g) => (
                <tr
                  key={g.market}
                  className={`focus-item border-t border-line/60 ${focusMkt && focusMkt !== g.market ? "dimmed" : ""}`}
                  onMouseEnter={() => setFocusMkt(g.market)}
                  onMouseLeave={() => setFocusMkt(null)}
                >
                  <td className="py-1.5">
                    <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: MARKET_COLOR[g.market] }} />
                    {g.market}
                  </td>
                  <td className="num text-right text-muted">{g.n}</td>
                  <td className="num text-right"><span className="rounded px-1.5" style={{ background: divergingBg(g.medRet1y, 0.4) }}>{pct(g.medRet1y)}</span></td>
                  <td className="num text-right">{pct(g.medVol1y, 0, false)}</td>
                  <td className="num text-right font-semibold">{g.medRetRisk.toFixed(2)}</td>
                  <td className="num text-right">{pct(g.medMdd1y, 0)}</td>
                  <td className="num text-right">{pct(g.positive1y, 0, false)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="p-4">
          <h2 className="text-sm font-semibold">Risco × Retorno (12 meses)</h2>
          <p className="mb-2 text-xs text-muted">Cada ponto é um ativo. Quanto mais para cima e para a esquerda, mais retorno com menos oscilação.</p>
          <RiskReturnScatter assets={data.assets} focus={focusSym} onFocus={setFocusSym} focusMarket={focusMkt} onFocusMarket={setFocusMkt} />
        </Card>
        <Card className="p-4">
          <h2 className="text-sm font-semibold">O que aconteceu depois de cada sinal</h2>
          <p className="mb-3 text-xs text-muted">
            Backtest com {data.backtest.years} anos de pregões de todas as ações da lista (B3 + EUA): em cada dia, qual era o sinal e quanto o preço andou nos {data.backtest.horizon} pregões seguintes.
          </p>
          <ForwardBars buckets={data.backtest.trend} baseline={data.backtest.baseline} horizon={data.backtest.horizon} />
          <div className="mt-5">
            <ForwardBars buckets={data.backtest.rsi} baseline={data.backtest.baseline} horizon={data.backtest.horizon} />
          </div>
          {data.backtest.byMarket.map((bm) => (
            <details key={bm.market} className="mt-4">
              <summary className="cursor-pointer text-xs text-muted hover:text-text">Só {bm.market}</summary>
              <div className="mt-2">
                <ForwardBars buckets={bm.trend} baseline={bm.baseline} horizon={data.backtest.horizon} />
              </div>
            </details>
          ))}
        </Card>
      </div>

      {/* Tabela por ativo */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Estatísticas por ativo</h2>
            <p className="text-xs text-muted">Clique nos títulos para ordenar. Passe o mouse nos títulos para ver o que cada coluna mede.</p>
          </div>
          <div className="flex gap-1">
            {(["Todos", "B3", "EUA", "Índices", "Cripto/Câmbio"] as const).map((g) => (
              <button key={g} type="button" onClick={() => setGroup(g)} className={`rounded-md px-2.5 py-1 text-xs ${group === g ? "bg-warn text-black" : "bg-card2 text-muted hover:text-text"}`}>
                {g}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-card2 text-[10px] uppercase tracking-wider text-muted">
              <tr>
                <th className="sticky left-0 bg-card2 px-3 py-2 text-left font-medium">Ativo</th>
                {COLS.map((c) => (
                  <th key={c.key} className="px-2 py-2 text-right font-medium" title={c.title}>
                    <button
                      type="button"
                      onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? (s.dir === 1 ? -1 : 1) : c.key === "vol1y" ? 1 : -1 }))}
                      className={`hover:text-text ${sort.key === c.key ? "text-text" : ""}`}
                    >
                      {c.label} {sort.key === c.key ? (sort.dir === -1 ? "↓" : "↑") : ""}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr
                  key={a.symbol}
                  className={`focus-item border-b border-line/50 hover:bg-card2/60 ${
                    (focusSym && focusSym !== a.symbol) || (!focusSym && focusMkt && focusMkt !== a.market) ? "dimmed" : ""
                  }`}
                  onMouseEnter={() => setFocusSym(a.symbol)}
                  onMouseLeave={() => setFocusSym(null)}
                >
                  <td className="sticky left-0 bg-card px-3 py-1.5">
                    <Link href={`/bolsa/ativo/${encodeURIComponent(a.symbol)}`} className="hover:underline">
                      <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: MARKET_COLOR[a.market] }} />
                      <span className="num font-semibold">{a.display}</span>
                    </Link>
                    <div className="max-w-[10rem] truncate text-[10px] text-muted">{a.name}</div>
                  </td>
                  {COLS.map((c) => (
                    <td key={c.key} className="num px-1 py-1.5 text-right">
                      <span className="inline-block min-w-[3.6rem] rounded px-1.5 py-0.5" style={{ background: c.bg?.(a) ?? "transparent" }}>
                        {c.fmt(a)}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data.failed.length > 0 && <p className="px-4 py-2 text-xs text-warn">Sem histórico para: {data.failed.join(", ")}</p>}
      </Card>

      {/* Sazonalidade */}
      <Card className="overflow-hidden">
        <div className="border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">Sazonalidade: retorno médio de cada mês (últimos ~5 anos)</h2>
          <p className="text-xs text-muted">
            Coluna destacada = próximo mês ({MONTHS_FULL[nextMonth]}). Com só ~5 ocorrências por mês, é uma tendência fraca: use como contexto, não como regra.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="text-[10px] uppercase tracking-wider text-muted">
              <tr>
                <th className="sticky left-0 bg-card px-3 py-2 text-left font-medium">Ativo</th>
                {MONTHS.map((m, i) => (
                  <th key={m} className={`px-1 py-2 text-center font-medium ${i === nextMonth ? "text-warn" : ""}`}>{m}</th>
                ))}
              </tr>
            </thead>
            <tbody className="focus-group">
              {data.assets.map((a) => (
                <tr key={a.symbol} className="focus-item">
                  <td className="num sticky left-0 bg-card px-3 py-0.5 font-semibold">{a.display}</td>
                  {a.seasonality.map((v, i) => (
                    <td key={i} className={`px-0.5 py-0.5 ${i === nextMonth ? "outline outline-1 -outline-offset-1 outline-warn/60" : ""}`}>
                      <div
                        className="num rounded-sm py-1 text-center text-white"
                        style={{ background: divergingBg(v, 0.08) }}
                        title={`${a.display} em ${MONTHS_FULL[i]}: média ${pct(v)} · positivo em ${pct(a.seasonalityPositive[i], 0, false)} dos anos`}
                      >
                        {v === null ? "–" : (v * 100).toFixed(1)}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Correlação */}
      <Card className="p-4">
        <h2 className="text-sm font-semibold">Correlação entre ativos (retornos diários, 12 meses)</h2>
        <p className="mb-3 text-xs text-muted">
          Azul = andam juntos (1 = idênticos). Laranja = andam em sentidos opostos. Para diversificar, combine ativos com correlação baixa.
        </p>
        <CorrelationMatrix symbols={data.correlation.symbols} matrix={data.correlation.matrix} />
      </Card>
    </div>
  );
}

function corrBg(v: number | null) {
  if (v === null) return "transparent";
  const k = Math.min(1, Math.abs(v));
  if (k < 0.1) return "#383835";
  return v > 0 ? `rgba(57,135,229,${0.15 + k * 0.8})` : `rgba(217,89,38,${0.15 + k * 0.8})`;
}

function CorrelationMatrix({ symbols, matrix }: { symbols: string[]; matrix: (number | null)[][] }) {
  // Passar o mouse numa célula acende a linha e a coluna dela; o resto escurece.
  const [hover, setHover] = useState<[number, number] | null>(null);
  const lit = (i: number, j: number) => !hover || i === hover[0] || j === hover[1];
  const v = hover ? matrix[hover[0]][hover[1]] : null;
  return (
    <div className="overflow-x-auto">
      <p className="num mb-2 h-4 text-xs">
        {hover ? (
          <>
            <b>{symbols[hover[0]]}</b> × <b>{symbols[hover[1]]}</b>: {v === null ? "sem dados" : v.toFixed(2)}{" "}
            <span className="text-muted">
              {v === null || hover[0] === hover[1] ? "" : v > 0.6 ? "(andam muito juntos)" : v > 0.3 ? "(andam um pouco juntos)" : v > -0.1 ? "(quase independentes: bom para diversificar)" : "(andam em sentidos opostos)"}
            </span>
          </>
        ) : (
          <span className="text-muted">Passe o mouse numa célula.</span>
        )}
      </p>
      <table className="border-separate border-spacing-[2px] text-[9px]" onMouseLeave={() => setHover(null)}>
        <thead>
          <tr>
            <th />
            {symbols.map((s, j) => (
              <th key={s} className={`num h-14 w-6 align-bottom font-medium transition-opacity ${hover && hover[1] === j ? "text-text" : hover ? "text-muted opacity-30" : "text-muted"}`}>
                <div className="mx-auto w-3 whitespace-nowrap [writing-mode:vertical-rl] rotate-180">{s}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, i) => (
            <tr key={symbols[i]}>
              <th className={`num pr-1 text-right font-medium whitespace-nowrap transition-opacity ${hover && hover[0] === i ? "text-text" : hover ? "text-muted opacity-30" : "text-muted"}`}>{symbols[i]}</th>
              {row.map((v, j) => (
                <td
                  key={j}
                  onMouseEnter={() => setHover([i, j])}
                  className={`focus-item h-6 w-6 rounded-sm text-center text-white/90 ${lit(i, j) ? "" : "dimmed"} ${hover && hover[0] === i && hover[1] === j ? "outline-2 outline-white" : ""}`}
                  style={{ background: corrBg(v) }}
                  title={`${symbols[i]} × ${symbols[j]}: ${v === null ? "sem dados" : v.toFixed(2)}`}
                >
                  {v === null || i === j ? "" : Math.round(v * 10)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[10px] text-muted">O número na célula é a correlação × 10 (ex: 7 = 0,7). Passe o mouse para o valor exato.</p>
    </div>
  );
}
