import { describe, expect, it } from "vitest";
import { bolsaContext, polyContext } from "@/lib/ai/prompt";
import type { BolsaAsset } from "@/lib/bolsa/types";
import type { PolyMarketDetail } from "@/lib/polymarket/types";
import { scoreBolsa } from "@/lib/score/bolsa";
import { scorePoly } from "@/lib/score/polymarket";
import { DEFAULT_BOLSA_SETTINGS, DEFAULT_POLY_SETTINGS } from "@/lib/score/types";

const asset: BolsaAsset = {
  symbol: "PETR4.SA", display: "PETR4", name: "Petrobras PN", market: "B3", currency: "BRL",
  price: 42.67, changePct: -1.16, changeAbs: -0.5, dayOpen: 43, dayHigh: 43.6, dayLow: 42.4, volume: 1, volRatio: 0.7, ma9: 44.17, ma21: 48.81, ma200: 44.85,
  rsi14: 28.2, macdHist: -0.6, macdHistPrev: -0.5, percentB: 0.21, atrPct: 3.9, high52: 59.79, low52: 29.53,
  spark: [], marketTime: 0,
};

describe("contexto enviado ao Claude", () => {
  it("bolsa traz preço, indicadores, score e alertas", () => {
    const candles = Array.from({ length: 120 }, (_, i) => ({ time: 1_780_000_000 + i * 86400, open: 40, high: 41, low: 39, close: 40 + (i % 5), volume: 1 }));
    const text = bolsaContext(asset, candles, scoreBolsa(asset, DEFAULT_BOLSA_SETTINGS));
    expect(text).toContain("PETR4");
    expect(text).toContain("RSI 14: 28.2");
    expect(text).toMatch(/Score do sistema: \d+\/100/);
    expect(text).toContain("Alertas:");
    expect((text.match(/\d{4}-\d{2}-\d{2}:/g) ?? []).length).toBe(40);
  });

  it("polymarket traz pergunta, probabilidades, livro e regras", () => {
    const d: PolyMarketDetail = {
      market: {
        id: "1", title: "Sim", question: "Vai acontecer?", eventTitle: "Evento", eventSlug: "e", slug: "s",
        category: "Política", image: null, outcomes: ["Sim", "Não"], prices: [0.6, 0.4], probability: 0.6,
        change1h: null, change24h: 0.05, change1w: -0.02, volume24h: 1000, volume1w: 5000, liquidity: 20000,
        spread: 0.01, bestBid: 0.59, bestAsk: 0.6, endDate: "2026-12-31T00:00:00Z", tokenIds: ["a"],
      },
      description: "Resolve Sim se acontecer.",
      history: [{ t: 1_780_000_000, p: 0.5 }, { t: 1_780_003_600, p: 0.6 }],
      book: { bids: [{ price: 0.59, size: 100 }], asks: [{ price: 0.6, size: 50 }] },
    };
    const text = polyContext(d, scorePoly(d.market, DEFAULT_POLY_SETTINGS));
    expect(text).toContain("Pergunta: Vai acontecer?");
    expect(text).toContain("Sim 60.0%");
    expect(text).toContain("1h n/d");
    expect(text).toContain("59.0¢ x 100");
    expect(text).toContain("Resolve Sim se acontecer.");
  });
});
