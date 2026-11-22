import "server-only";
import { categoryOfTags } from "@/lib/polymarket/server";
import { cached } from "@/lib/server/cache";
import { getJson, mapLimit } from "@/lib/server/net";

/**
 * Backtest de regras de aposta no Polymarket com mercados já resolvidos.
 * Para cada mercado: o preço X horas antes do fim (e 24h antes disso), o lado escolhido pela regra,
 * comprado 1¢ acima do preço (custo de spread) e segurado até o resultado ($1 ou $0).
 * Cada mercado entra uma vez por regra e por prazo. Separado em duas metades no tempo.
 */

const GAMMA = "https://gamma-api.polymarket.com";
const CLOB = "https://clob.polymarket.com";
const WINDOW_DAYS = 120;
const MAX_MARKETS = 1200;
const MIN_VOLUME = 5_000;
const COST = 0.01;
export const HORIZONS = [168, 72, 24, 6] as const;

interface ClosedMarket {
  id: string;
  question: string;
  outcomes?: string;
  outcomePrices?: string;
  clobTokenIds?: string;
  closed?: boolean;
  volumeNum?: number;
  startDate?: string;
  closedTime?: string;
}
interface ClosedEvent {
  tags?: { slug?: string; label?: string }[];
  markets?: ClosedMarket[];
}

const parse = (s?: string): string[] => {
  try {
    const v = JSON.parse(s ?? "[]");
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
};
const parseTime = (s?: string) => {
  if (!s) return null;
  const t = Date.parse(s.replace(" ", "T").replace(/\+00$/, "Z"));
  return Number.isFinite(t) ? t : null;
};

interface Cand {
  id: string;
  token: string;
  closedAt: number;
  startedAt: number | null;
  yes: 0 | 1;
  category: string;
  volume: number;
}

async function candidates(): Promise<Cand[]> {
  const now = Date.now();
  const min = new Date(now - WINDOW_DAYS * 86_400_000).toISOString();
  const max = new Date(now).toISOString();
  const offsets = Array.from({ length: 20 }, (_, i) => i * 100);
  const pages = await mapLimit(offsets, 4, (offset) =>
    getJson<ClosedEvent[]>(
      `${GAMMA}/events?closed=true&order=volume&ascending=false&limit=100&offset=${offset}&end_date_min=${min}&end_date_max=${max}`,
      { publicDns: true, timeoutMs: 25_000 },
    ),
  );
  const out: Cand[] = [];
  const seen = new Set<string>();
  for (const page of pages) {
    if (page.status !== "fulfilled") continue;
    for (const ev of page.value) {
      const category = categoryOfTags(ev.tags);
      for (const m of ev.markets ?? []) {
        if (!m.closed || seen.has(m.id)) continue;
        const prices = parse(m.outcomePrices);
        const tokens = parse(m.clobTokenIds);
        if (prices.length !== 2 || tokens.length !== 2) continue;
        const yes = prices[0] === "1" ? 1 : prices[0] === "0" ? 0 : null;
        if (yes === null || prices[0] === prices[1]) continue;
        const closedAt = parseTime(m.closedTime);
        if (!closedAt || (m.volumeNum ?? 0) < MIN_VOLUME) continue;
        seen.add(m.id);
        out.push({ id: m.id, token: tokens[0], closedAt, startedAt: parseTime(m.startDate), yes: yes as 0 | 1, category, volume: m.volumeNum ?? 0 });
      }
    }
  }
  return out.sort((a, b) => b.volume - a.volume).slice(0, MAX_MARKETS);
}

interface Snap {
  h: number;
  p: number;
  /** Variação do "Sim" nas 24h anteriores (em pontos de probabilidade). */
  d24: number | null;
}

interface Sample {
  closedAt: number;
  category: string;
  yes: 0 | 1;
  snaps: Snap[];
}

async function sample(c: Cand): Promise<Sample | null> {
  const end = Math.floor(c.closedAt / 1000);
  const start = end - (Math.max(...HORIZONS) + 30) * 3600;
  const r = await getJson<{ history?: { t: number; p: number }[] }>(`${CLOB}/prices-history?market=${c.token}&startTs=${start}&endTs=${end}&fidelity=60`, {
    publicDns: true,
    timeoutMs: 20_000,
  });
  const h = (r.history ?? []).filter((x) => Number.isFinite(x.p));
  if (h.length < 5) return null;
  const at = (t: number) => {
    let best: { t: number; p: number } | null = null;
    for (const x of h) if (!best || Math.abs(x.t - t) < Math.abs(best.t - t)) best = x;
    return best && Math.abs(best.t - t) <= 3 * 3600 ? best.p : null;
  };
  const snaps: Snap[] = [];
  for (const hz of HORIZONS) {
    const t = end - hz * 3600;
    if (c.startedAt && t * 1000 < c.startedAt) continue;
    const p = at(t);
    if (p === null || p <= 0.005 || p >= 0.995) continue;
    const prev = at(t - 24 * 3600);
    snaps.push({ h: hz, p, d24: prev === null ? null : p - prev });
  }
  return snaps.length ? { closedAt: c.closedAt, category: c.category, yes: c.yes, snaps } : null;
}

/** Uma regra olha o preço do "Sim" e decide comprar "Sim", "Não" ou nada. */
interface Rule {
  key: string;
  label: string;
  desc: string;
  pick: (s: Snap) => "sim" | "nao" | null;
}

const side = (p: number, lo: number, hi: number): "sim" | "nao" | null => (p >= lo && p < hi ? "sim" : 1 - p >= lo && 1 - p < hi ? "nao" : null);

export const RULES: Rule[] = [
  { key: "fav70", label: "Favorito (70–90%)", desc: "Compra o lado que o mercado dá como provável, entre 70% e 90%.", pick: (s) => side(s.p, 0.7, 0.9) },
  { key: "fav90", label: "Quase certo (90–97%)", desc: "Compra o lado quase certo: ganha pouco, quase sempre.", pick: (s) => side(s.p, 0.9, 0.97) },
  { key: "azarao", label: "Azarão (5–30%)", desc: "Compra o lado improvável: perde quase sempre, mas paga muito quando acerta.", pick: (s) => side(s.p, 0.05, 0.3) },
  { key: "nao", label: "Sempre “Não” (Sim entre 15% e 85%)", desc: "Aposta contra o evento acontecer. Testa se o público exagera no “Sim”.", pick: (s) => (s.p >= 0.15 && s.p <= 0.85 ? "nao" : null) },
  { key: "sim", label: "Sempre “Sim” (entre 15% e 85%)", desc: "O contrário do anterior, para comparar.", pick: (s) => (s.p >= 0.15 && s.p <= 0.85 ? "sim" : null) },
  {
    key: "momento",
    label: "Momento: quem subiu 5+ pts em 24h",
    desc: "Compra o lado que ganhou força no último dia (preço entre 10% e 90%).",
    pick: (s) => (s.d24 === null || s.p < 0.1 || s.p > 0.9 ? null : s.d24 >= 0.05 ? "sim" : s.d24 <= -0.05 ? "nao" : null),
  },
  {
    key: "reversao",
    label: "Reversão: quem caiu 5+ pts em 24h",
    desc: "Compra o lado que perdeu força no último dia, apostando em exagero.",
    pick: (s) => (s.d24 === null || s.p < 0.1 || s.p > 0.9 ? null : s.d24 <= -0.05 ? "sim" : s.d24 >= 0.05 ? "nao" : null),
  },
];

export interface RuleStat {
  h: number;
  n: number;
  winRate: number;
  roi: number;
  ciLow: number;
  ciHigh: number;
  roiA: number | null;
  roiB: number | null;
  avgPrice: number;
}

export interface PolyBacktest {
  markets: number;
  from: number;
  to: number;
  splitAt: number;
  cost: number;
  horizons: number[];
  rules: { key: string; label: string; desc: string; stats: RuleStat[] }[];
  /** Por categoria, no prazo de 24h. */
  byCategory: { key: string; rows: { category: string; n: number; roi: number; ciLow: number; ciHigh: number }[] }[];
  at: number;
}

function stat(xs: { r: number; w: boolean; price: number; t: number }[], splitAt: number, h: number): RuleStat {
  const n = xs.length;
  const rs = xs.map((x) => x.r);
  const m = n ? rs.reduce((a, b) => a + b, 0) / n : 0;
  const sd = n > 1 ? Math.sqrt(rs.reduce((s, r) => s + (r - m) ** 2, 0) / (n - 1)) : 0;
  const half = (f: (x: (typeof xs)[number]) => boolean) => {
    const ys = xs.filter(f);
    return ys.length >= 10 ? ys.reduce((s, x) => s + x.r, 0) / ys.length : null;
  };
  return {
    h,
    n,
    winRate: n ? xs.filter((x) => x.w).length / n : 0,
    roi: m,
    ciLow: m - (1.96 * sd) / Math.sqrt(Math.max(1, n)),
    ciHigh: m + (1.96 * sd) / Math.sqrt(Math.max(1, n)),
    roiA: half((x) => x.t < splitAt),
    roiB: half((x) => x.t >= splitAt),
    avgPrice: n ? xs.reduce((s, x) => s + x.price, 0) / n : 0,
  };
}

export function getPolyBacktest() {
  return cached("poly:bt:v1", 12 * 3_600_000, async (): Promise<PolyBacktest> => {
    const cands = await candidates();
    const res = await mapLimit(cands, 8, sample);
    const samples = res.flatMap((r) => (r.status === "fulfilled" && r.value ? [r.value] : []));
    if (!samples.length) throw new Error("Nenhum mercado resolvido com histórico encontrado");
    const times = samples.map((s) => s.closedAt).sort((a, b) => a - b);
    const splitAt = times[Math.floor(times.length / 2)];

    const outcome = (s: Sample, snap: Snap, pick: "sim" | "nao") => {
      const price = Math.min(0.999, (pick === "sim" ? snap.p : 1 - snap.p) + COST);
      const won = pick === "sim" ? s.yes === 1 : s.yes === 0;
      return { r: (won ? 1 : 0) / price - 1, w: won, price, t: s.closedAt };
    };

    const rules = RULES.map((rule) => ({
      key: rule.key,
      label: rule.label,
      desc: rule.desc,
      stats: HORIZONS.map((h) => {
        const xs = samples.flatMap((s) => {
          const snap = s.snaps.find((x) => x.h === h);
          const pick = snap ? rule.pick(snap) : null;
          return snap && pick ? [outcome(s, snap, pick)] : [];
        });
        return stat(xs, splitAt, h);
      }),
    }));

    const byCategory = RULES.map((rule) => {
      const groups = new Map<string, { r: number; w: boolean; price: number; t: number }[]>();
      for (const s of samples) {
        const snap = s.snaps.find((x) => x.h === 24);
        const pick = snap ? rule.pick(snap) : null;
        if (!snap || !pick) continue;
        groups.set(s.category, [...(groups.get(s.category) ?? []), outcome(s, snap, pick)]);
      }
      return {
        key: rule.key,
        rows: [...groups.entries()]
          .map(([category, xs]) => {
            const st = stat(xs, splitAt, 24);
            return { category, n: st.n, roi: st.roi, ciLow: st.ciLow, ciHigh: st.ciHigh };
          })
          .sort((a, b) => b.n - a.n),
      };
    });

    return { markets: samples.length, from: times[0], to: times[times.length - 1], splitAt, cost: COST, horizons: [...HORIZONS], rules, byCategory, at: Date.now() };
  });
}
