import "server-only";
import type { AssetStats } from "@/lib/analise/types";
import { buildAsset, fetchChart } from "@/lib/bolsa/server";
import type { BolsaAsset, Candle } from "@/lib/bolsa/types";
import { CORE_ETFS, MOMENTUM_UNIVERSE } from "@/lib/bolsa/universe";
import type { Perfil } from "@/lib/perfil";
import { pickBolsa } from "@/lib/picks";
import { cached } from "@/lib/server/cache";
import { cdiReturn, getCdi } from "@/lib/server/cdi";
import { mapLimit } from "@/lib/server/net";
import { scoreBolsa } from "@/lib/score/bolsa";
import { DEFAULT_BOLSA_SETTINGS } from "@/lib/score/types";
import { annualVol, mean, simpleReturns } from "@/lib/stats";

/**
 * Testa no passado as regras de escolha, contra alternativas.
 * - Tudo comprável pelo Brasil e em reais: ações da B3, BDRs (ações americanas) e ETFs.
 * - Preços ajustados por dividendos (retorno total).
 * - Sem olhar o futuro: cada decisão usa só candles até a data.
 * - Desde 2010, com cerca de 80 ativos. Resultado separado em duas metades: uma regra boa
 *   tem que funcionar nas duas, não só no período em que foi escolhida.
 */

export { CORE_ETFS };

type Series = { symbol: string; candles: Candle[]; currency: string };

const START = Date.UTC(2010, 0, 4) / 1000;
const MIN_HISTORY = 260;

async function load(symbol: string): Promise<Series> {
  const r = await cached(`bt:hist:since:${symbol}`, 12 * 60 * 60_000, async () => {
    const { meta, candles } = await fetchChart(symbol, `since:${START - 400 * 86400}`, "1d", { adjusted: true });
    return { symbol, candles: candles.filter((c) => c.time >= START - 400 * 86400 && c.close > 0), currency: meta.currency ?? "" };
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

interface State {
  s: Series;
  i: number;
  mom: number;
  vol: number | null;
  retRisk: number | null;
  /** Indicadores do app naquele dia (calculados só se alguma estratégia pedir). */
  asset: () => BolsaAsset;
}

function stateAt(s: Series, i: number): State | null {
  if (i < MIN_HISTORY) return null;
  const closes = s.candles.slice(i - 252, i + 1).map((c) => c.close);
  const r = simpleReturns(closes);
  const vol = annualVol(r);
  let a: BolsaAsset | null = null;
  return {
    s,
    i,
    // momento 12-1: retorno de 12 meses ignorando o último mês
    mom: s.candles[i - 21].close / s.candles[i - 252].close - 1,
    vol,
    retRisk: vol ? (mean(r) * 252) / vol : null,
    asset: () => {
      if (!a) {
        const window = s.candles.slice(i - 259, i + 1);
        const last = window[window.length - 1];
        a = buildAsset(
          s.symbol,
          { symbol: s.symbol, currency: s.currency, regularMarketPrice: last.close, regularMarketTime: last.time } as Parameters<typeof buildAsset>[1],
          window,
        );
      }
      return a;
    },
  };
}

/** Retorno de segurar do fechamento de i até o último fechamento ≤ tEnd; com stop, sai quando tocar. */
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
  /** Retorno total descontando 0,1% de custo a cada compra e venda. */
  totalAfterCosts: number;
  /** Retorno ao ano na 1ª e na 2ª metade do período. */
  cagrA: number;
  cagrB: number;
  /** Retorno ao ano acima do CDI (negativo = perdeu para a renda fixa). */
  overCdi?: number | null;
  equity: { t: number; v: number }[];
  lastPicks: string[];
}

type Item = { s: Series; w: number; stop: number | null };

interface Strategy {
  key: string;
  label: string;
  desc: string;
  pick: (stocks: State[], etfs: State[]) => Item[];
}

const cagrOf = (rs: number[], ppy: number) => {
  if (!rs.length) return 0;
  const v = rs.reduce((acc, r) => acc * (1 + r), 1);
  return v ** (ppy / rs.length) - 1;
};

function summarize(st: Strategy, rets: { t: number; r: number; picks: string[] }[], ppy: number): StrategyResult {
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
  const m = mean(rs);
  const sd = Math.sqrt(rs.reduce((s, r) => s + (r - m) ** 2, 0) / Math.max(1, rs.length - 1));
  const vol = sd * Math.sqrt(ppy);
  const cagr = cagrOf(rs, ppy);
  const half = Math.floor(rs.length / 2);
  return {
    key: st.key,
    label: st.label,
    desc: st.desc,
    periods: rets.length,
    total: v - 1,
    cagr,
    vol,
    retRisk: vol ? cagr / vol : 0,
    maxDD,
    winRate: rs.filter((r) => r > 0).length / Math.max(1, rs.length),
    avg: m,
    worst: Math.min(...rs),
    best: Math.max(...rs),
    turnover: turnSum / Math.max(1, rets.length),
    totalAfterCosts: vc - 1,
    cagrA: cagrOf(rs.slice(0, half), ppy),
    cagrB: cagrOf(rs.slice(half), ppy),
    equity,
    lastPicks: rets.at(-1)?.picks ?? [],
  };
}

export interface BacktestResult {
  from: number;
  to: number;
  /** Data que divide as duas metades. */
  splitAt: number;
  n: number;
  periodDays: number;
  perfil: Perfil;
  strategies: StrategyResult[];
  universe: string[];
  at: number;
}

export function runBacktest(perfil: Perfil, n: number, periodDays: 7 | 28) {
  return cached(`bt:run:v9:${perfil}:${n}:${periodDays}`, 12 * 60 * 60_000, async (): Promise<BacktestResult> => {
    const symbols = [...MOMENTUM_UNIVERSE, ...CORE_ETFS];
    const benches = ["^BVSP", "^GSPC"];
    const all = [...symbols, ...benches];
    const loaded = await mapLimit(all, 6, load);
    const series = new Map<string, Series>();
    loaded.forEach((r, k) => r.status === "fulfilled" && r.value.candles.length > MIN_HISTORY && series.set(all[k], r.value));
    const inv = symbols.map((s) => series.get(s)).filter((s): s is Series => !!s);

    const end = Math.max(...inv.map((s) => s.candles[s.candles.length - 1].time)) - 2 * 86400;
    const step = periodDays * 86400;
    const dates: number[] = [];
    for (let t = START; t + step <= end; t += step) dates.push(t);

    // Situação de cada ativo em cada data (só com o passado).
    const snapshots = dates.map((t) => {
      const states = inv
        .map((s) => {
          const i = idxAt(s.candles, t);
          return i >= 0 && t - s.candles[i].time < 5 * 86400 ? stateAt(s, i) : null;
        })
        .filter((x): x is State => !!x);
      return {
        t,
        etfs: states.filter((x) => CORE_ETFS.includes(x.s.symbol)),
        stocks: states.filter((x) => !CORE_ETFS.includes(x.s.symbol)),
      };
    });

    const eq = (list: State[], stop: number | null = null): Item[] => list.map((x) => ({ s: x.s, w: 1 / list.length, stop }));
    const top = (list: State[], f: (x: State) => number, asc = false) => [...list].sort((a, b) => (asc ? f(a) - f(b) : f(b) - f(a))).slice(0, n);
    const appPick = (stocks: State[]) => {
      const byAsset = new Map(stocks.map((x) => [x.s.symbol, x]));
      const { best } = pickBolsa(
        stocks.map((x) => x.asset()),
        stocks.map((x) => ({ symbol: x.s.symbol, vol1y: x.vol, retRisk1y: x.retRisk }) as unknown as AssetStats),
        perfil,
        DEFAULT_BOLSA_SETTINGS,
        { n, investableOnly: true },
      );
      return best.map((b) => byAsset.get(b.a.symbol)!);
    };
    /** Núcleo + momento (versão de ontem). */
    const nucleoMom = (stocks: State[], etfs: State[]): Item[] => {
      const m = top(stocks, (x) => x.mom);
      if (!etfs.length) return eq(m);
      return [...etfs.map((e) => ({ s: e.s, w: 0.5 / etfs.length, stop: null })), ...m.map((x) => ({ s: x.s, w: 0.5 / m.length, stop: null }))];
    };
    /** Regra adotada: 1/3 núcleo, 1/3 momento, 1/3 baixa volatilidade. */
    const tresPartes = (stop: number | null) => (stocks: State[], etfs: State[]): Item[] => {
      const part = etfs.length ? 1 / 3 : 0.5;
      return [
        ...etfs.map((x) => ({ s: x.s, w: part / etfs.length, stop: null })),
        ...top(stocks, (x) => x.mom).map((x) => ({ s: x.s, w: part / n, stop })),
        ...top(stocks, (x) => x.vol ?? 9, true).map((x) => ({ s: x.s, w: part / n, stop })),
      ];
    };

    const strategies: Strategy[] = [
      {
        key: "nova",
        label: "Regra nova: núcleo + momento + baixa volatilidade",
        desc: "Um terço nos ETFs do núcleo, um terço nas 4 com mais momento, um terço nas 4 que menos oscilam. É a regra da carteira automática.",
        pick: tresPartes(null),
      },
      { key: "nova-stop", label: "Regra nova + stop 15% nas ações", desc: "Igual, com stop de 15% na parte de ações.", pick: tresPartes(0.15) },
      { key: "nucleo-mom", label: "Núcleo + momento (versão anterior)", desc: "50% nos ETFs do núcleo e 50% nas 4 com mais momento.", pick: nucleoMom },
      {
        key: "fatores",
        label: "Momento + baixa volatilidade (sem núcleo)",
        desc: "Metade nas 4 com mais momento, metade nas 4 que menos oscilam. Rende mais no papel, mas depende só de ações da lista (mais viés).",
        pick: (s) => [...top(s, (x) => x.mom).map((x) => ({ s: x.s, w: 0.5 / n, stop: null })), ...top(s, (x) => x.vol ?? 9, true).map((x) => ({ s: x.s, w: 0.5 / n, stop: null }))],
      },
      { key: "app", label: "Regra antiga (score do app)", desc: "Maior score + retorno por risco. Era o que a carteira automática fazia.", pick: (s) => eq(appPick(s)) },
      { key: "app-stop", label: "Regra antiga + stop 8%", desc: "Igual, saindo se cair 8% dentro do período.", pick: (s) => eq(appPick(s), 0.08) },
      { key: "momento", label: "Momento 12-1", desc: "As que mais subiram em 12 meses, ignorando o último mês.", pick: (s) => eq(top(s, (x) => x.mom)) },
      { key: "baixavol", label: "Baixa volatilidade", desc: "As que menos oscilaram no último ano.", pick: (s) => eq(top(s, (x) => x.vol ?? 9, true)) },
      { key: "todos", label: "Comprar todos (pesos iguais)", desc: "Divide igualmente entre todas as ações disponíveis. É o “não escolher”.", pick: (s) => eq(s) },
      { key: "piores", label: "Contrário: menor score", desc: "As piores pelo score do app. Se o score funciona, esta deve ir mal.", pick: (s) => eq(top(s, (x) => scoreBolsa(x.asset(), DEFAULT_BOLSA_SETTINGS).score, true)) },
      { key: "nucleo", label: "Núcleo: BOVA11 + IVVB11", desc: "Os ETFs do Ibovespa e do S&P 500 em reais, em partes iguais (até 2014 só BOVA11).", pick: (_s, e) => eq(e) },
    ];

    const ppy = 365 / periodDays;
    const out: StrategyResult[] = [];
    for (const st of strategies) {
      const rets: { t: number; r: number; picks: string[] }[] = [];
      for (const snap of snapshots) {
        if (snap.stocks.length < Math.max(n, 15)) continue;
        const items = st.pick(snap.stocks, snap.etfs);
        if (!items.length) {
          rets.push({ t: snap.t * 1000, r: 0, picks: [] });
          continue;
        }
        const idx = new Map([...snap.stocks, ...snap.etfs].map((x) => [x.s, x.i]));
        const r = items.reduce((acc, it) => acc + it.w * hold(it.s, idx.get(it.s)!, snap.t + periodDays * 86400, it.stop), 0);
        rets.push({ t: snap.t * 1000, r, picks: items.map((it) => it.s.symbol) });
      }
      out.push(summarize(st, rets, ppy));
    }

    const used = out[0]?.equity ?? [];
    for (const [sym, label] of [["^BVSP", "Ibovespa (índice)"], ["^GSPC", "S&P 500 (em dólar)"]] as const) {
      const s = series.get(sym);
      if (!s) continue;
      const rets = used.map(({ t }) => {
        const i = idxAt(s.candles, t / 1000);
        return { t, r: i >= 0 ? hold(s, i, t / 1000 + periodDays * 86400, null) : 0, picks: [sym] };
      });
      out.push(summarize({ key: sym, label, desc: "Referência: o índice inteiro, sem escolher nada.", pick: () => [] }, rets, ppy));
    }

    // CDI: o que o dinheiro rende parado, sem risco. É a régua de comparação no Brasil.
    try {
      const cdi = (await getCdi()).value;
      const rets = used.map(({ t }) => ({ t, r: cdiReturn(cdi, t / 1000, t / 1000 + periodDays * 86400), picks: ["CDI"] }));
      out.push(summarize({ key: "cdi", label: "CDI (renda fixa sem risco)", desc: "Quanto o dinheiro teria rendido parado, num CDB/Tesouro Selic que paga 100% do CDI, antes do IR.", pick: () => [] }, rets, ppy));
    } catch {
      /* sem CDI agora: segue sem a referência */
    }
    const cdiRes = out.find((s) => s.key === "cdi");
    for (const s of out) s.overCdi = cdiRes ? s.cagr - cdiRes.cagr : null;

    const from = used[0]?.t ?? START * 1000;
    const to = used.at(-1)?.t ?? end * 1000;
    return {
      from,
      to,
      splitAt: used[Math.floor(used.length / 2)]?.t ?? from,
      n,
      periodDays,
      perfil,
      strategies: out,
      universe: inv.map((s) => s.symbol),
      at: Date.now(),
    };
  });
}
