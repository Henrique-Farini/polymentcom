import "server-only";
import { cached } from "@/lib/server/cache";
import { getJson, mapLimit } from "@/lib/server/net";

/**
 * Radar de arbitragem em eventos com vários resultados que se excluem (ex.: "quem vai ganhar").
 * Exatamente um resultado acontece, então:
 * - Comprar o "Sim" de todos custa a soma dos preços de venda (asks) e paga $1 no fim.
 *   Lucro garantido se a soma < $1, MAS só se a lista estiver completa. Em eventos "aumentáveis"
 *   (podem ganhar novos candidatos), um resultado fora da lista faria todos perderem: não é garantido.
 * - Comprar o "Não" de todos custa n − soma dos bids e paga n − 1 (ou n, se ganhar alguém de fora).
 *   Lucro garantido se a soma dos bids > $1, mesmo em eventos aumentáveis.
 * O dinheiro fica preso até o resultado: comparamos o ganho ao ano com o CDI.
 */

const GAMMA = "https://gamma-api.polymarket.com";
const CLOB = "https://clob.polymarket.com";

interface GMarket {
  id: string;
  question: string;
  groupItemTitle?: string;
  active?: boolean;
  closed?: boolean;
  acceptingOrders?: boolean;
  bestBid?: number | string;
  bestAsk?: number | string;
  clobTokenIds?: string;
  negRiskOther?: boolean;
}
interface GEvent {
  id: string;
  title: string;
  slug: string;
  endDate?: string;
  negRisk?: boolean;
  negRiskAugmented?: boolean;
  volume24hr?: number;
  markets?: GMarket[];
}

export interface ArbOpportunity {
  eventId: string;
  title: string;
  slug: string;
  outcomes: number;
  augmented: boolean;
  endDate: string | null;
  days: number | null;
  sumAsk: number;
  sumBid: number;
  kind: "sim" | "nao";
  /** Lucro por conjunto, sobre o custo. */
  ret: number;
  /** Ganho equivalente ao ano, se o dinheiro ficar preso até o resultado. */
  annual: number | null;
  guaranteed: boolean;
  /** Quantos conjuntos dá para montar no melhor preço (null = não verificado). */
  sets: number | null;
  profitUsd: number | null;
  costPerSet: number;
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

async function topSize(token: string, side: "asks" | "bids") {
  const b = await getJson<{ bids?: { price: string; size: string }[]; asks?: { price: string; size: string }[] }>(`${CLOB}/book?token_id=${token}`, {
    publicDns: true,
    timeoutMs: 15_000,
  });
  const levels = (b[side] ?? []).map((l) => ({ p: Number(l.price), s: Number(l.size) }));
  if (!levels.length) return 0;
  const best = side === "asks" ? Math.min(...levels.map((l) => l.p)) : Math.max(...levels.map((l) => l.p));
  return levels.filter((l) => l.p === best).reduce((s, l) => s + l.s, 0);
}

export function getArbitragem() {
  return cached("poly:arb:v1", 60_000, async () => {
    const pages = await mapLimit([0, 100, 200], 3, (offset) =>
      getJson<GEvent[]>(`${GAMMA}/events?active=true&closed=false&archived=false&order=volume24hr&ascending=false&limit=100&offset=${offset}`, {
        publicDns: true,
        timeoutMs: 25_000,
      }),
    );
    const events = pages.flatMap((p) => (p.status === "fulfilled" ? p.value : []));
    const now = Date.now();
    const found: (ArbOpportunity & { tokens: string[] })[] = [];
    let checked = 0;

    for (const e of events) {
      if (!e.negRisk) continue;
      const ms = (e.markets ?? []).filter((m) => m.active && !m.closed && m.acceptingOrders !== false && !m.negRiskOther);
      if (ms.length < 3) continue;
      const asks = ms.map((m) => num(m.bestAsk));
      const bids = ms.map((m) => num(m.bestBid));
      if (asks.some((a) => a === null || a <= 0) || bids.some((b) => b === null)) continue;
      checked++;
      const sumAsk = asks.reduce((s, a) => s! + a!, 0)!;
      const sumBid = bids.reduce((s, b) => s! + b!, 0)!;
      const end = e.endDate ? Date.parse(e.endDate) : NaN;
      const days = Number.isFinite(end) ? Math.max(1, (end - now) / 86_400_000) : null;
      const tokens = ms.map((m) => {
        try {
          return (JSON.parse(m.clobTokenIds ?? "[]") as string[])[0] ?? "";
        } catch {
          return "";
        }
      });
      const base = { eventId: e.id, title: e.title, slug: e.slug, outcomes: ms.length, augmented: !!e.negRiskAugmented, endDate: e.endDate ?? null, days, sumAsk, sumBid, sets: null, profitUsd: null, tokens };
      const annual = (ret: number) => (days ? (1 + ret) ** (365 / days) - 1 : null);
      if (sumAsk < 0.995) {
        const ret = (1 - sumAsk) / sumAsk;
        found.push({ ...base, kind: "sim", ret, annual: annual(ret), guaranteed: !e.negRiskAugmented, costPerSet: sumAsk });
      }
      if (sumBid > 1.005) {
        const cost = ms.length - sumBid;
        const ret = (sumBid - 1) / cost;
        found.push({ ...base, kind: "nao", ret, annual: annual(ret), guaranteed: true, costPerSet: cost });
      }
    }

    // Profundidade: quantos conjuntos cabem no melhor preço de cada resultado (só eventos menores).
    const ranked = found.sort((a, b) => Number(b.guaranteed) - Number(a.guaranteed) || b.ret - a.ret).slice(0, 12);
    await mapLimit(ranked, 3, async (o) => {
      if (o.outcomes > 30 || o.tokens.some((t) => !t)) return;
      const sizes = await mapLimit(o.tokens, 6, (t) => topSize(t, o.kind === "sim" ? "asks" : "bids"));
      const ok = sizes.map((s) => (s.status === "fulfilled" ? s.value : 0));
      o.sets = Math.floor(Math.min(...ok));
      o.profitUsd = o.sets * o.costPerSet * o.ret;
    });

    return {
      checked,
      opportunities: ranked.map(({ tokens: _t, ...o }) => o),
      at: Date.now(),
    };
  });
}
