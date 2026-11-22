import { describe, expect, it } from "vitest";
import { simGrid, simulateAll, simulateTrade, summarizeTrades, type Bar } from "@/lib/simulador";

const flat = (closes: number[]): Bar[] => closes.map((c) => ({ open: c, high: c, low: c, close: c }));

describe("simulateTrade", () => {
  it("segura os dias e vende no fechamento", () => {
    const t = simulateTrade(flat([100, 101, 102, 110]), 0, 3, null)!;
    expect(t.ret).toBeCloseTo(0.1);
    expect(t.stopped).toBe(false);
    expect(t.held).toBe(3);
  });

  it("sai no stop quando a mínima toca o limite", () => {
    const bars: Bar[] = [
      { open: 100, high: 100, low: 100, close: 100 },
      { open: 99, high: 99, low: 94, close: 97 },
      { open: 97, high: 120, low: 97, close: 120 },
    ];
    const t = simulateTrade(bars, 0, 2, 0.05)!;
    expect(t.ret).toBeCloseTo(-0.05);
    expect(t.stopped).toBe(true);
    expect(t.gapped).toBe(false);
    expect(t.held).toBe(1);
  });

  it("quando abre abaixo do stop, vende na abertura (perde mais que o stop)", () => {
    const bars: Bar[] = [
      { open: 100, high: 100, low: 100, close: 100 },
      { open: 85, high: 86, low: 84, close: 85 },
    ];
    const t = simulateTrade(bars, 0, 1, 0.05)!;
    expect(t.ret).toBeCloseTo(-0.15);
    expect(t.gapped).toBe(true);
  });

  it("não simula quando faltam dias no histórico", () => {
    expect(simulateTrade(flat([1, 2]), 0, 5, null)).toBeNull();
  });
});

describe("summarizeTrades", () => {
  it("calcula taxa de acerto, média e histograma", () => {
    const trades = simulateAll(flat([100, 110, 99, 120, 108]), 1, null);
    const s = summarizeTrades(trades, 4);
    expect(s.n).toBe(4);
    expect(s.winRate).toBeCloseTo(0.5);
    expect(s.hist.reduce((a, b) => a + b.n, 0)).toBe(4);
    expect(s.worst).toBeLessThan(0);
    expect(s.best).toBeGreaterThan(0);
  });

  it("lista vazia não quebra", () => {
    expect(summarizeTrades([]).n).toBe(0);
  });
});

describe("simGrid", () => {
  it("gera todas as combinações com histórico suficiente", () => {
    const closes = Array.from({ length: 300 }, (_, i) => 100 + Math.sin(i / 5) * 10 + i * 0.1);
    const g = simGrid(flat(closes));
    expect(g.length).toBe(5 * 7);
    expect(g.every((c) => c.n > 0)).toBe(true);
  });
});
