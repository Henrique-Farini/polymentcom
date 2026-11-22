import "server-only";
import { cached } from "@/lib/server/cache";
import { getJson } from "@/lib/server/net";
import type { BookLevel, PolyHistoryPoint, PolyMarket, PolyMarketDetail } from "./types";

const GAMMA = "https://gamma-api.polymarket.com";
const CLOB = "https://clob.polymarket.com";

interface GammaTag {
  label?: string;
  slug?: string;
}

interface GammaMarket {
  id: string;
  question: string;
  slug: string;
  description?: string;
  groupItemTitle?: string;
  image?: string;
  icon?: string;
  outcomes?: string;
  outcomePrices?: string;
  clobTokenIds?: string;
  active?: boolean;
  closed?: boolean;
  acceptingOrders?: boolean;
  endDate?: string;
  volume24hr?: number;
  volume1wk?: number;
  liquidityNum?: number;
  liquidity?: string;
  spread?: number;
  bestBid?: number;
  bestAsk?: number;
  oneHourPriceChange?: number;
  oneDayPriceChange?: number;
  oneWeekPriceChange?: number;
  events?: GammaEvent[];
  category?: string;
}

interface GammaEvent {
  id: string;
  title: string;
  slug: string;
  image?: string;
  tags?: GammaTag[];
  markets?: GammaMarket[];
}

function parseArray(s: string | undefined): string[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};

const CATEGORY_BY_TAG: Record<string, string> = {
  politics: "Política",
  elections: "Política",
  "us-politics": "Política",
  "world-elections": "Política",
  economy: "Economia",
  economics: "Economia",
  finance: "Economia",
  business: "Economia",
  fed: "Economia",
  "fed-rates": "Economia",
  stocks: "Economia",
  crypto: "Cripto",
  bitcoin: "Cripto",
  ethereum: "Cripto",
  geopolitics: "Geopolítica",
  world: "Geopolítica",
  tech: "Tecnologia",
  ai: "Tecnologia",
  science: "Tecnologia",
  sports: "Esportes",
  soccer: "Esportes",
  nba: "Esportes",
  nfl: "Esportes",
  culture: "Cultura",
  "pop-culture": "Cultura",
  entertainment: "Cultura",
  movies: "Cultura",
  music: "Cultura",
};

export function categoryOfTags(tags: GammaTag[] | undefined): string {
  return categoryOf(tags);
}

function categoryOf(tags: GammaTag[] | undefined, fallback?: string): string {
  for (const t of tags ?? []) {
    const c = CATEGORY_BY_TAG[(t.slug ?? "").toLowerCase()];
    if (c) return c;
  }
  if (fallback) {
    const c = CATEGORY_BY_TAG[fallback.toLowerCase()];
    if (c) return c;
  }
  return "Outros";
}

const translateOutcome = (o: string) => (o === "Yes" ? "Sim" : o === "No" ? "Não" : o);

function toMarket(m: GammaMarket, ev: GammaEvent | undefined): PolyMarket | null {
  const prices = parseArray(m.outcomePrices).map(Number);
  const outcomes = parseArray(m.outcomes).map(translateOutcome);
  if (prices.length === 0 || !Number.isFinite(prices[0])) return null;
  return {
    id: String(m.id),
    title: m.groupItemTitle || m.question,
    question: m.question,
    eventTitle: ev?.title ?? m.question,
    eventSlug: ev?.slug ?? m.slug,
    slug: m.slug,
    category: categoryOf(ev?.tags, m.category),
    image: m.icon || m.image || ev?.image || null,
    outcomes,
    prices,
    probability: prices[0],
    change1h: num(m.oneHourPriceChange),
    change24h: num(m.oneDayPriceChange),
    change1w: num(m.oneWeekPriceChange),
    volume24h: num(m.volume24hr) ?? 0,
    volume1w: num(m.volume1wk) ?? 0,
    liquidity: num(m.liquidityNum) ?? num(m.liquidity) ?? 0,
    spread: num(m.spread),
    bestBid: num(m.bestBid),
    bestAsk: num(m.bestAsk),
    endDate: m.endDate ?? null,
    tokenIds: parseArray(m.clobTokenIds),
  };
}

const MAX_MARKETS = 400;

/** Mercados abertos mais negociados nas últimas 24h. */
export function getMarkets() {
  return cached("poly:markets", 15_000, async () => {
    const pages = await Promise.all(
      [0, 100].map((offset) =>
        getJson<GammaEvent[]>(
          `${GAMMA}/events?active=true&closed=false&archived=false&order=volume24hr&ascending=false&limit=100&offset=${offset}`,
          { publicDns: true },
        ),
      ),
    );
    const seen = new Set<string>();
    const out: PolyMarket[] = [];
    for (const ev of pages.flat()) {
      for (const m of ev.markets ?? []) {
        if (!m.active || m.closed || m.acceptingOrders === false || seen.has(String(m.id))) continue;
        const pm = toMarket(m, ev);
        if (!pm || pm.volume24h < 500) continue;
        seen.add(pm.id);
        out.push(pm);
      }
    }
    out.sort((a, b) => b.volume24h - a.volume24h);
    return out.slice(0, MAX_MARKETS);
  });
}

const HISTORY_RANGES: Record<string, { interval: string; fidelity: number }> = {
  "1d": { interval: "1d", fidelity: 5 },
  "1s": { interval: "1w", fidelity: 30 },
  "1m": { interval: "1m", fidelity: 180 },
  max: { interval: "max", fidelity: 720 },
};

export function historyRanges() {
  return Object.keys(HISTORY_RANGES);
}

function parseBook(levels: { price: string; size: string }[] | undefined): BookLevel[] {
  return (levels ?? [])
    .map((l) => ({ price: Number(l.price), size: Number(l.size) }))
    .filter((l) => Number.isFinite(l.price) && Number.isFinite(l.size));
}

export function getMarketDetail(id: string, range: string) {
  const r = HISTORY_RANGES[range] ?? HISTORY_RANGES["1s"];
  return cached(`poly:detail:${id}:${range}`, 5_000, async (): Promise<PolyMarketDetail> => {
    const raw = await getJson<GammaMarket>(`${GAMMA}/markets/${encodeURIComponent(id)}`, { publicDns: true });
    const market = toMarket(raw, raw.events?.[0]);
    if (!market) throw new Error("Mercado sem preços");
    if (market.category === "Outros") {
      // A consulta de um mercado só não traz as tags; usa a categoria da lista, se já estiver carregada.
      const fromList = await getMarkets()
        .then((r) => r.value.find((x) => x.id === market.id))
        .catch(() => undefined);
      if (fromList) market.category = fromList.category;
    }
    const yes = market.tokenIds[0];

    const [hist, book] = await Promise.allSettled([
      yes
        ? getJson<{ history: PolyHistoryPoint[] }>(
            `${CLOB}/prices-history?market=${yes}&interval=${r.interval}&fidelity=${r.fidelity}`,
            { publicDns: true },
          )
        : Promise.resolve({ history: [] }),
      yes
        ? getJson<{ bids?: { price: string; size: string }[]; asks?: { price: string; size: string }[] }>(
            `${CLOB}/book?token_id=${yes}`,
            { publicDns: true },
          )
        : Promise.reject(new Error("sem token")),
    ]);

    return {
      market,
      description: raw.description ?? "",
      history: hist.status === "fulfilled" ? hist.value.history ?? [] : [],
      book:
        book.status === "fulfilled"
          ? {
              bids: parseBook(book.value.bids).sort((a, b) => b.price - a.price).slice(0, 12),
              asks: parseBook(book.value.asks).sort((a, b) => a.price - b.price).slice(0, 12),
            }
          : null,
    };
  });
}

/** Preço atual de um mercado, mesmo encerrado (para a carteira de teste). */
export async function getMarketQuote(id: string) {
  const raw = await getJson<GammaMarket>(`${GAMMA}/markets/${encodeURIComponent(id)}`, { publicDns: true });
  const market = toMarket(raw, raw.events?.[0]);
  if (!market) throw new Error("Mercado sem preços");
  return { market, closed: !!raw.closed };
}
