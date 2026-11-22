import "server-only";
import { categoryOfTags } from "@/lib/polymarket/server";
import { cached } from "@/lib/server/cache";
import { getJson, mapLimit } from "@/lib/server/net";
import { brier, calibrate, mean, type CalibrationSample } from "@/lib/stats";
import type { CategoryCalibration, PolyAnalysis } from "./types";

const GAMMA = "https://gamma-api.polymarket.com";
const CLOB = "https://clob.polymarket.com";

/** Quanto tempo antes do encerramento olhamos o preço. */
const HOURS_BEFORE = 24;
/** Janela de mercados resolvidos analisados. */
const WINDOW_DAYS = 45;
const MAX_MARKETS = 600;
const MIN_VOLUME = 10_000;

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
  umaResolutionStatus?: string;
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

function parseTime(s?: string): number | null {
  if (!s) return null;
  // closedTime vem como "2026-11-21 01:19:25.27+00"
  const t = Date.parse(s.replace(" ", "T").replace(/\+00$/, "Z"));
  return Number.isFinite(t) ? t : null;
}

interface Candidate {
  token: string;
  closedAt: number;
  yesWon: 0 | 1;
  category: string;
  volume: number;
}

async function candidates(): Promise<Candidate[]> {
  const now = Date.now();
  const min = new Date(now - WINDOW_DAYS * 86_400_000).toISOString();
  const max = new Date(now).toISOString();
  const pages = await mapLimit([0, 100, 200, 300, 400, 500, 600, 700], 3, (offset) =>
    getJson<ClosedEvent[]>(
      `${GAMMA}/events?closed=true&order=volume&ascending=false&limit=100&offset=${offset}&end_date_min=${min}&end_date_max=${max}`,
      { publicDns: true, timeoutMs: 25_000 },
    ),
  );
  const out: Candidate[] = [];
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
        // Só mercados resolvidos de forma limpa (um lado 1, outro 0).
        const yes = prices[0] === "1" ? 1 : prices[0] === "0" ? 0 : null;
        if (yes === null || (prices[1] !== "1" && prices[1] !== "0") || prices[0] === prices[1]) continue;
        const closedAt = parseTime(m.closedTime);
        const startedAt = parseTime(m.startDate);
        if (!closedAt || (m.volumeNum ?? 0) < MIN_VOLUME) continue;
        // Precisa ter existido pelo menos 2 dias para haver preço 24h antes.
        if (startedAt && closedAt - startedAt < 2 * 86_400_000) continue;
        seen.add(m.id);
        out.push({ token: tokens[0], closedAt, yesWon: yes as 0 | 1, category, volume: m.volumeNum ?? 0 });
      }
    }
  }
  return out.sort((a, b) => b.volume - a.volume).slice(0, MAX_MARKETS);
}

async function priceBefore(c: Candidate): Promise<number | null> {
  const target = Math.floor((c.closedAt - HOURS_BEFORE * 3_600_000) / 1000);
  const r = await getJson<{ history?: { t: number; p: number }[] }>(
    `${CLOB}/prices-history?market=${c.token}&startTs=${target - 6 * 3600}&endTs=${target + 6 * 3600}&fidelity=60`,
    { publicDns: true, timeoutMs: 20_000 },
  );
  const h = r.history ?? [];
  if (!h.length) return null;
  let best = h[0];
  for (const p of h) if (Math.abs(p.t - target) < Math.abs(best.t - target)) best = p;
  return Number.isFinite(best.p) ? best.p : null;
}

function categoryStats(category: string, s: CalibrationSample[], markets: number): CategoryCalibration {
  const fav = s.filter((x) => x.p >= 0.7);
  const long = s.filter((x) => x.p > 0 && x.p <= 0.3);
  const roi = (xs: CalibrationSample[]) => (xs.length ? mean(xs.map((x) => x.y / x.p - 1)) : null);
  return {
    category,
    markets,
    brier: brier(s),
    roiFavorites: roi(fav),
    nFavorites: fav.length,
    roiLongshots: roi(long),
    nLongshots: long.length,
  };
}

export function getPolyAnalysis() {
  return cached("analise:poly:v2", 6 * 3_600_000, async (): Promise<PolyAnalysis> => {
    const cands = await candidates();
    const prices = await mapLimit(cands, 8, priceBefore);
    const samples: CalibrationSample[] = [];
    const byCat = new Map<string, { samples: CalibrationSample[]; markets: number }>();
    let markets = 0;
    prices.forEach((r, i) => {
      if (r.status !== "fulfilled" || r.value === null) return;
      const p = r.value;
      const c = cands[i];
      // Usa os dois lados do mercado: "Sim" a p e "Não" a 1-p.
      const pair: CalibrationSample[] = [
        { p, y: c.yesWon, category: c.category },
        { p: 1 - p, y: (1 - c.yesWon) as 0 | 1, category: c.category },
      ];
      samples.push(...pair);
      markets++;
      const g = byCat.get(c.category) ?? { samples: [], markets: 0 };
      g.samples.push(...pair);
      g.markets++;
      byCat.set(c.category, g);
    });
    if (!samples.length) throw new Error("Nenhum mercado resolvido com histórico encontrado");
    return {
      markets,
      samples: samples.length,
      hoursBefore: HOURS_BEFORE,
      windowDays: WINDOW_DAYS,
      brier: brier(samples),
      buckets: calibrate(samples),
      categories: [...byCat.entries()]
        .map(([cat, g]) => categoryStats(cat, g.samples, g.markets))
        .sort((a, b) => b.markets - a.markets),
      at: Date.now(),
    };
  });
}
