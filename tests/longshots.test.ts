import { describe, expect, it } from "vitest";
import { pickLongshots } from "@/lib/picks";
import type { PolyMarket } from "@/lib/polymarket/types";
import { DEFAULT_POLY_SETTINGS } from "@/lib/score/types";

const NOW = Date.UTC(2026, 10, 21);
const mk = (id: string, p: number, days: number, extra: Partial<PolyMarket> = {}): PolyMarket => ({
  id, title: id, question: id, eventTitle: id, eventSlug: id, slug: id, category: "Esportes", image: null,
  outcomes: ["Sim", "Não"], prices: [p, 1 - p], probability: p, change1h: 0, change24h: 0, change1w: 0,
  volume24h: 1e5, volume1w: 1e6, liquidity: 50_000, spread: 0.01, bestBid: p - 0.005, bestAsk: p + 0.005,
  endDate: new Date(NOW + days * 86_400_000).toISOString(), tokenIds: [], ...extra,
});

describe("pickLongshots", () => {
  it("escolhe o lado azarão (Sim barato ou Não barato) dentro do prazo", () => {
    const r = pickLongshots([mk("a", 0.2, 5), mk("b", 0.85, 4), mk("c", 0.5, 5), mk("d", 0.2, 20)], DEFAULT_POLY_SETTINGS, { minDays: 2, maxDays: 9, now: NOW });
    expect(r.map((x) => `${x.m.id}:${x.side}`)).toEqual(["a:sim", "b:nao"]);
    expect(r[1].price).toBeCloseTo(0.155);
  });

  it("ignora spread largo e liquidez baixa", () => {
    const r = pickLongshots([mk("a", 0.2, 5, { spread: 0.08 }), mk("b", 0.2, 5, { liquidity: 100 })], DEFAULT_POLY_SETTINGS, { minDays: 2, maxDays: 9, now: NOW });
    expect(r).toEqual([]);
  });
});
