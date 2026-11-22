import { describe, expect, it } from "vitest";
import {
  alignedReturns,
  annualVol,
  beta,
  brier,
  cagr,
  calibrate,
  correlation,
  maxDrawdown,
  monthlySeasonality,
  periodReturn,
  rsiZone,
  sharpe,
  signalForwardReturns,
  simpleReturns,
} from "@/lib/stats";

describe("retornos e risco", () => {
  it("periodReturn", () => {
    expect(periodReturn([100, 110, 121], 2)).toBeCloseTo(0.21, 10);
    expect(periodReturn([100], 5)).toBeNull();
  });
  it("cagr: dobra em 1 ano = 100%", () => {
    const closes = Array.from({ length: 253 }, (_, i) => 100 * 2 ** (i / 252));
    expect(cagr(closes)!).toBeCloseTo(1, 6);
  });
  it("volatilidade zero para retorno constante", () => {
    expect(annualVol([0.01, 0.01, 0.01])).toBeCloseTo(0, 10);
  });
  it("sharpe positivo quando sobe com oscilação", () => {
    expect(sharpe([0.02, -0.01, 0.02, -0.005, 0.015])!).toBeGreaterThan(0);
  });
  it("maxDrawdown", () => {
    expect(maxDrawdown([100, 120, 60, 90, 130])).toBeCloseTo(-0.5, 10);
    expect(maxDrawdown([1, 2, 3])).toBe(0);
  });
  it("correlação e beta", () => {
    const a = [0.01, -0.02, 0.03, 0.005, -0.01, 0.02, 0.0, -0.015, 0.01, 0.02, -0.01];
    const b = a.map((x) => 2 * x);
    expect(correlation(a, b)!).toBeCloseTo(1, 10);
    expect(beta(Array(25).fill(0).map((_, i) => b[i % b.length]), Array(25).fill(0).map((_, i) => a[i % a.length]))!).toBeCloseTo(2, 10);
  });
  it("alignedReturns usa só dias em comum", () => {
    const [ra, rb] = alignedReturns(
      [{ day: "2026-01-01", close: 10 }, { day: "2026-01-02", close: 11 }, { day: "2026-01-03", close: 12.1 }],
      [{ day: "2026-01-01", close: 100 }, { day: "2026-01-03", close: 110 }],
    );
    expect(ra).toHaveLength(1);
    expect(ra[0]).toBeCloseTo(0.21, 10);
    expect(rb[0]).toBeCloseTo(0.1, 10);
  });
  it("simpleReturns", () => {
    expect(simpleReturns([100, 110, 99])).toEqual([0.10000000000000009, -0.09999999999999998]);
  });
});

describe("sazonalidade", () => {
  it("retorno médio por mês", () => {
    const series = [
      { day: "2025-01-31", close: 100 },
      { day: "2025-02-28", close: 110 },
      { day: "2025-03-31", close: 99 },
    ];
    const s = monthlySeasonality(series);
    expect(s.avg[1]).toBeCloseTo(0.1, 10);
    expect(s.avg[2]).toBeCloseTo(-0.1, 10);
    expect(s.avg[0]).toBeNull();
  });
});

describe("backtest de sinais", () => {
  it("numa alta constante tudo é 'alta forte' e o retorno seguinte é positivo", () => {
    const closes = Array.from({ length: 400 }, (_, i) => 100 * 1.002 ** i);
    const r = signalForwardReturns(closes, 20);
    expect(r.byTrend.get("alta-forte")!.length).toBe(r.all.length);
    expect(Math.min(...r.all)).toBeGreaterThan(0);
  });
  it("zonas de RSI", () => {
    expect(rsiZone(25)).toBe("<30");
    expect(rsiZone(50)).toBe("45-55");
    expect(rsiZone(70)).toBe("55-70");
    expect(rsiZone(80)).toBe(">70");
  });
});

describe("calibração", () => {
  it("mercado perfeitamente calibrado tem edge ~0 e ROI ~0", () => {
    const samples = [
      ...Array(80).fill(0).map(() => ({ p: 0.8, y: 1 as const, category: "x" })),
      ...Array(20).fill(0).map(() => ({ p: 0.8, y: 0 as const, category: "x" })),
    ];
    const [b] = calibrate(samples);
    expect(b.n).toBe(100);
    expect(b.hitRate).toBeCloseTo(0.8, 10);
    expect(b.edgePts).toBeCloseTo(0, 10);
    expect(b.roi).toBeCloseTo(0, 10);
  });
  it("brier: chute de 50% dá 0.25", () => {
    expect(brier([{ p: 0.5, y: 1, category: "x" }, { p: 0.5, y: 0, category: "x" }])).toBeCloseTo(0.25, 10);
  });
});

describe("wilson", () => {
  it("50 de 100 fica perto de 40%–60%", async () => {
    const { wilson } = await import("@/lib/stats");
    const ci = wilson(50, 100);
    expect(ci.ciLow).toBeCloseTo(0.404, 2);
    expect(ci.ciHigh).toBeCloseTo(0.596, 2);
  });
  it("amostra pequena tem intervalo largo", async () => {
    const { wilson } = await import("@/lib/stats");
    const ci = wilson(4, 5);
    expect(ci.ciHigh - ci.ciLow).toBeGreaterThan(0.5);
  });
});
