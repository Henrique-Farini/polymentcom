import { describe, expect, it } from "vitest";
import type { BolsaAsset } from "@/lib/bolsa/types";
import type { PolyMarket } from "@/lib/polymarket/types";
import { scoreBolsa } from "@/lib/score/bolsa";
import { compose } from "@/lib/score/compose";
import { scorePoly } from "@/lib/score/polymarket";
import { DEFAULT_BOLSA_SETTINGS, DEFAULT_POLY_SETTINGS } from "@/lib/score/types";

const asset = (over: Partial<BolsaAsset> = {}): BolsaAsset => ({
  symbol: "TEST3.SA",
  display: "TEST3",
  name: "Teste",
  market: "B3",
  currency: "BRL",
  price: 110,
  changePct: 1.5,
  changeAbs: 1.6,
  dayOpen: 108,
  dayHigh: 111,
  dayLow: 107,
  volume: 2_000_000,
  volRatio: 1.8,
  ma9: 105,
  ma21: 100,
  ma200: 90,
  rsi14: 62,
  macdHist: 0.5,
  macdHistPrev: 0.3,
  percentB: 0.8,
  atrPct: 2,
  high52: 120,
  low52: 80,
  spark: [],
  marketTime: 0,
  ...over,
});

const NOW = Date.parse("2026-11-20T12:00:00Z");

const market = (over: Partial<PolyMarket> = {}): PolyMarket => ({
  id: "1",
  title: "Sim",
  question: "Vai acontecer?",
  eventTitle: "Evento",
  eventSlug: "evento",
  slug: "vai",
  category: "Política",
  image: null,
  outcomes: ["Sim", "Não"],
  prices: [0.55, 0.45],
  probability: 0.55,
  change1h: 0.01,
  change24h: 0.08,
  change1w: 0.12,
  volume24h: 800_000,
  volume1w: 2_000_000,
  liquidity: 600_000,
  spread: 0.01,
  bestBid: 0.545,
  bestAsk: 0.555,
  endDate: "2026-12-20T00:00:00Z",
  tokenIds: ["a", "b"],
  ...over,
});

describe("compose", () => {
  it("score é 100 quando todas as notas são 1", () => {
    const { score } = compose(
      [
        { key: "a", label: "A", value: 1, note: "" },
        { key: "b", label: "B", value: 1, note: "" },
      ],
      { a: 10, b: 30 },
    );
    expect(score).toBe(100);
  });
  it("respeita os pesos", () => {
    const { score } = compose(
      [
        { key: "a", label: "A", value: 1, note: "" },
        { key: "b", label: "B", value: 0, note: "" },
      ],
      { a: 25, b: 75 },
    );
    expect(score).toBe(25);
  });
});

describe("scoreBolsa", () => {
  it("ativo em alta saudável fica em destaque", () => {
    const r = scoreBolsa(asset(), DEFAULT_BOLSA_SETTINGS);
    expect(r.status).toBe("destaque");
    expect(r.score).toBeGreaterThanOrEqual(65);
    expect(r.reasons.length).toBeGreaterThan(0);
  });
  it("queda forte no dia vai para alerta", () => {
    const r = scoreBolsa(asset({ changePct: -6 }), DEFAULT_BOLSA_SETTINGS);
    expect(r.status).toBe("alerta");
    expect(r.alerts.join(" ")).toMatch(/Caiu/);
  });
  it("RSI baixo com MACD negativo gera alerta", () => {
    const r = scoreBolsa(asset({ rsi14: 25, macdHist: -1, macdHistPrev: -0.5, changePct: -1 }), DEFAULT_BOLSA_SETTINGS);
    expect(r.alerts.some((a) => a.includes("RSI"))).toBe(true);
  });
  it("limite de queda configurável", () => {
    const s = { ...DEFAULT_BOLSA_SETTINGS, dropPct: 10 };
    expect(scoreBolsa(asset({ changePct: -6 }), s).alerts.some((a) => a.startsWith("Caiu"))).toBe(false);
  });
});

describe("scorePoly", () => {
  it("mercado subindo com liquidez fica em destaque", () => {
    const r = scorePoly(market(), DEFAULT_POLY_SETTINGS, NOW);
    expect(r.status).toBe("destaque");
  });
  it("queda de 15 pontos em 24h vai para alerta", () => {
    const r = scorePoly(market({ change24h: -0.15 }), DEFAULT_POLY_SETTINGS, NOW);
    expect(r.status).toBe("alerta");
  });
  it("liquidez baixa vai para alerta", () => {
    const r = scorePoly(market({ liquidity: 1_000 }), DEFAULT_POLY_SETTINGS, NOW);
    expect(r.alerts.some((a) => a.includes("Liquidez"))).toBe(true);
  });
  it("mercado quase decidido não entra em destaque", () => {
    const r = scorePoly(market({ probability: 0.985, prices: [0.985, 0.015] }), DEFAULT_POLY_SETTINGS, NOW);
    expect(r.status).not.toBe("destaque");
  });
});
