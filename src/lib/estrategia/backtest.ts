import "server-only";
import type { AssetStats } from "@/lib/analise/types";
import { buildAsset, fetchChart } from "@/lib/bolsa/server";
import type { BolsaAsset, Candle } from "@/lib/bolsa/types";
import { DEFAULT_UNIVERSE } from "@/lib/bolsa/universe";
import type { Perfil } from "@/lib/perfil";
import { pickBolsa } from "@/lib/picks";
import { cached } from "@/lib/server/cache";
import { mapLimit } from "@/lib/server/net";
import { scoreBolsa } from "@/lib/score/bolsa";
import { DEFAULT_BOLSA_SETTINGS } from "@/lib/score/types";
import { annualVol, mean, simpleReturns } from "@/lib/stats";

/**
 * Testa no passado a regra que o app usa para escolher onde investir, contra alternativas.
 * A cada semana (ou mês): olha só os dados até aquele dia, escolhe N ativos, segura pelo prazo, mede.
 * Sem olhar o futuro: cada decisão usa apenas candles anteriores à data.
 */

type Series = { symbol: string; candles: Candle[]; currency: string };

const DAY = 86_400_000;

async function load(symbol: string): Promise<Series> {
  const r = await cached(`bt:hist:${symbol}`, 6 * 60 * 60_000, async () => {
    const { meta, candles } = await fetchChart(symbol, "5y", "1d");
    return { symbol, candles, currency: meta.currency ?? "" };
  });
  return r.value;
}

/** Último índice com candle até o instante t (busca binária). */
function idxAt(c: Candle[], tSec: number) {
  let lo = 0;
  let hi = c.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (c[m].time <= tSec) (ans = m), (lo = m + 1);
    else hi = m - 1;
  }
  return ans;
}

/** Recria o que o app "via" naquele dia: indicadores e estatísticas de 1 ano só com o passado. */
function stateAt(s: Series, i: number): { a: BolsaAsset; st: AssetStats } | null {
  if (i < 260) return null;
  const window = s.candles.slice(i - 259, i + 1);
  const last = window[window.length - 1];
  const a = buildAsset(
    s.symbol,
    { symbol: s.symbol, currency: s.currency, regularMarketPrice: last.close, regularMarketTime: last.time } as Parameters<typeof buildAsset>[1],
    window,
  );
  const closes = s.candles.slice(i - 252, i + 1).map((c) => c.close);
  const r = simpleReturns(closes);
  const vol = annualVol(r);
  const st = {
    symbol: s.symbol,
    vol1y: vol,
    retRisk1y: vol ? (mean(r) * 252) / vol : null,
    ret1y: closes[closes.length - 1] / closes[0] - 1,
    // momento 12-1: retorno de 12 meses ignorando o último mês
    mom: s.candles[i - 21].close / s.candles[i - 252].close - 1,
  } as unknown as AssetStats & { mom: number };
  return { a, st };
}

/** Retorno de segurar do fechamento de i até o último fechamento ≤ tEnd; com stop, sai na mínima que tocar. */
function hold(s: Series, i: number, tEndSec: number, stop: number | null) {
  const entry = s.candles[i].close;
  const j = idxAt(s.candles, tEndSec);
  if (j <= i) return 0;
  if (stop) {
    const sp = entry * (1 - stop);
    for (let k = i + 1; k <= j; k++) {
      const b = s.candles[k];
      if (b.open <= sp) return b.open / entry - 1;
      if (b.low <= sp) return -stop;
    }
  }
  return s.candles[j].close / entry - 1;
}

export interface StrategyResult {
  key: string;
  label: string;
  desc: string;
  periods: number;
  total: number;
  cagr: number;
  vol: number;
  retRisk: number;
  maxDD: number;
  winRate: number;
  avg: number;
  worst: number;
  best: number;
  /** % médio da carteira trocado a cada período. */
  turnover: number;
  /** Retorno total descontando 0,1% de custo a cada troca. */
  totalAfterCosts: number;
  equity: { t: number; v: number }[];
  lastPicks: string[];
}

interface Strategy {
  key: string;
  label: string;
  desc: string;
  /** Recebe só ações/cripto (sem ETFs) e devolve a escolha com pesos iguais. */
  pick?: (states: State[]) => Series[];
  /** Escolha com pesos e stop por item (para misturar ETFs com ações). */
  weighted?: (stocks: State[], etfs: State[]) => { s: Series; w: number; stop: number | null }[];
  stop?: number | null;
}

type State = { s: Series; i: number; a: BolsaAsset; st: AssetStats & { mom: number } };

/** ETFs que formam o "núcleo": o mercado brasileiro e o americano inteiros. */
export const CORE_ETFS = ["BOVA11.SA", "IVVB11.SA"];

function summarize(key: string, label: string, desc: string, rets: { t: number; r: number; picks: string[] }[], periodsPerYear: number): StrategyResult {
  let v = 1;
  let peak = 1;
  let maxDD = 0;
  let vc = 1;
  let turnSum = 0;
  const equity: { t: number; v: number }[] = [];
  let prev: string[] = [];
  for (const x of rets) {
    const changed = prev.length ? x.picks.filter((p) => !prev.includes(p)).length / Math.max(1, x.picks.length) : 1;
    turnSum += changed;
    v *= 1 + x.r;
    vc *= (1 + x.r) * (1 - 0.001 * 2 * changed);
    peak = Math.max(peak, v);
    maxDD = Math.min(maxDD, v / peak - 1);
    equity.push({ t: x.t, v });
    prev = x.picks;
  }
  const rs = rets.map((x) => x.r);
  const years = rets.length / periodsPerYear;
  const sd = Math.sqrt(rs.reduce((s, r) => s + (r - mean(rs)) ** 2, 0) / Math.max(1, rs.length - 1));
  const vol = sd * Math.sqrt(periodsPerYear);
  const cagr = years > 0 ? v ** (1 / years) - 1 : 0;
  return {
    key,
    label,
    desc,
    periods: rets.length,
    total: v - 1,
    cagr,
    vol,
    retRisk: vol ? cagr / vol : 0,
    maxDD,
    winRate: rs.filter((r) => r > 0).length / Math.max(1, rs.length),
    avg: mean(rs),
    worst: Math.min(...rs),
    best: Math.max(...rs),
    turnover: turnSum / Math.max(1, rets.length),
    totalAfterCosts: vc - 1,
    equity,
    lastPicks: rets.at(-1)?.picks ?? [],
  };
}

export interface BacktestResult {
  from: number;
  to: number;
  n: number;
  periodDays: number;
  perfil: Perfil;
  strategies: StrategyResult[];
  universe: string[];
  at: number;
}

export function runBacktest(perfil: Perfil, n: number, periodDays: 7 | 28) {
  return cached(`bt:run:v3:${perfil}:${n}:${periodDays}`, 6 * 60 * 60_000, async (): Promise<BacktestResult> => {
    const investable = DEFAULT_UNIVERSE.filter((u) => !u.symbol.startsWith("^") && !u.symbol.endsWith("=X")).map((u) => u.symbol);
    const all = [...investable, "^BVSP", "^GSPC"];
    const loaded = await mapLimit(all, 6, load);
    const series = new Map<string, Series>();
    loaded.forEach((r, k) => r.status === "fulfilled" && series.set(all[k], r.value));
    const inv = investable.map((s) => series.get(s)).filter((s): s is Series => !!s && s.candles.length > 300);

    const start = Math.max(...inv.map((s) => s.candles[260]?.time ?? Infinity).filter(Number.isFinite));
    const end = Math.min(...inv.map((s) => s.candles[s.candles.length - 1].time));
    // Sextas-feiras (ou a cada 28 dias): datas de decisão.
    const dates: number[] = [];
    for (let t = start + 3 * DAY / 1000; t + periodDays * 86400 <= end; t += periodDays * 86400) dates.push(t);

    const perPerfil = (p: Perfil) => (states: State[]) => {
      const { best } = pickBolsa(
        states.map((x) => x.a),
        states.map((x) => x.st),
        p,
        DEFAULT_BOLSA_SETTINGS,
        { n, investableOnly: true },
      );
      return best.map((b) => states.find((x) => x.a.symbol === b.a.symbol)!.s);
    };
    const topBy = (f: (x: State) => number, asc = false) => (states: State[]) =>
      [...states].sort((x, y) => (asc ? f(x) - f(y) : f(y) - f(x))).slice(0, n).map((x) => x.s);
    const momTop = topBy((x) => x.st.mom);
    /** Regra nova: metade no núcleo (ETFs), metade nos n com mais momento. */
    const nova = (stop: number | null) => (stocks: State[], etfs: State[]) => {
      const m = momTop(stocks);
      const core = etfs.length ? etfs : [];
      const wCore = core.length ? 0.5 / core.length : 0;
      const wMom = (core.length ? 0.5 : 1) / Math.max(1, m.length);
      return [...core.map((e) => ({ s: e.s, w: wCore, stop: null })), ...m.map((s) => ({ s, w: wMom, stop }))];
    };

    const strategies: Strategy[] = [
      { key: "app", label: `Regra do app (perfil ${perfil})`, desc: "O que a carteira automática faz hoje: maior score + retorno por risco, dentro do perfil.", pick: perPerfil(perfil) },
      { key: "app-stop", label: "Regra do app + stop 8%", desc: "Igual, saindo se cair 8% dentro do período.", pick: perPerfil(perfil), stop: 0.08 },
      { key: "todos", label: "Comprar todos (pesos iguais)", desc: "Divide igualmente entre todos os ativos da lista. É o “não escolher”.", pick: (st) => st.map((x) => x.s) },
      { key: "momento", label: "Momento 12-1", desc: "Os que mais subiram em 12 meses (ignorando o último mês). Estratégia clássica e bem estudada.", pick: topBy((x) => x.st.mom) },
      { key: "baixavol", label: "Baixa volatilidade", desc: "Os que menos oscilaram no último ano. Outra estratégia clássica.", pick: topBy((x) => x.st.vol1y ?? 9, true) },
      { key: "piores", label: "Contrário: menor score", desc: "Os piores pelo score do app. Se o score funciona, este deve ir mal.", pick: topBy((x) => scoreOf(x.a), true) },
      {
        key: "nucleo",
        label: "Núcleo: BOVA11 + IVVB11",
        desc: "Metade no ETF do Ibovespa, metade no ETF do S&P 500 em reais. O mercado inteiro, sem escolher ações.",
        weighted: (_s, etfs) => etfs.map((e) => ({ s: e.s, w: 1 / etfs.length, stop: null })),
      },
      { key: "nova", label: "Regra nova: núcleo + momento", desc: "50% nos dois ETFs e 50% nas 4 ações com mais momento (12-1).", weighted: nova(null) },
      { key: "nova-stop", label: "Regra nova + stop 15% nas ações", desc: "Igual, com stop largo de 15% só na parte de ações.", weighted: nova(0.15) },
    ];

    const out: StrategyResult[] = [];
    for (const strat of strategies) {
      const rets: { t: number; r: number; picks: string[] }[] = [];
      for (const t of dates) {
        const states = inv
          .map((s) => {
            const i = idxAt(s.candles, t);
            const x = i >= 0 && t - s.candles[i].time < 5 * 86400 ? stateAt(s, i) : null;
            return x ? { s, i, a: x.a, st: x.st as AssetStats & { mom: number } } : null;
          })
          .filter((x): x is NonNullable<typeof x> => !!x);
        const etfs = states.filter((x) => CORE_ETFS.includes(x.s.symbol));
        const stocks = states.filter((x) => !CORE_ETFS.includes(x.s.symbol));
        if (stocks.length < n) continue;
        const items = strat.weighted
          ? strat.weighted(stocks, etfs)
          : (strat.pick!(stocks).map((s, _k, arr) => ({ s, w: 1 / arr.length, stop: strat.stop ?? null })) as { s: Series; w: number; stop: number | null }[]);
        if (!items.length) {
          rets.push({ t: t * 1000, r: 0, picks: [] });
          continue;
        }
        const r = items.reduce((acc, it) => acc + it.w * hold(it.s, states.find((x) => x.s === it.s)!.i, t + periodDays * 86400, it.stop), 0);
        rets.push({ t: t * 1000, r, picks: items.map((it) => it.s.symbol) });
      }
      out.push(summarize(strat.key, strat.label, strat.desc, rets, 365 / periodDays));
    }

    for (const [sym, label] of [["^BVSP", "Ibovespa (comprar e segurar)"], ["^GSPC", "S&P 500 (comprar e segurar)"]] as const) {
      const s = series.get(sym);
      if (!s) continue;
      const rets = dates.map((t) => {
        const i = idxAt(s.candles, t);
        return { t: t * 1000, r: i >= 0 ? hold(s, i, t + periodDays * 86400, null) : 0, picks: [sym] };
      });
      out.push(summarize(sym, label, "Referência: o índice inteiro, sem escolher nada.", rets, 365 / periodDays));
    }

    return { from: dates[0] * 1000, to: dates[dates.length - 1] * 1000, n, periodDays, perfil, strategies: out, universe: inv.map((s) => s.symbol), at: Date.now() };
  });
}

const scoreOf = (a: BolsaAsset) => scoreBolsa(a, DEFAULT_BOLSA_SETTINGS).score;
