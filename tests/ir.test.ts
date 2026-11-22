import { describe, expect, it } from "vitest";
import { applyQuote, emptyCarteira, placeOrder, closeManual } from "@/lib/carteira/engine";
import { estimateTax, taxClassOf } from "@/lib/carteira/ir";

const T0 = Date.UTC(2026, 10, 2, 13); // segunda, 2/11/2026
const DAY = 86_400_000;
const base = { area: "bolsa" as const, label: "X", sub: "", currency: "BRL" as const, stopPct: null, holdDays: 30 };

function trade(ref: string, buy: number, sell: number, amount = 1000, days = 2) {
  const c = emptyCarteira(100_000, T0);
  const p = placeOrder(c, { ...base, ref, amountBRL: amount }, T0);
  applyQuote(c, p, { price: buy, time: T0 + 1 }, 1, T0 + 1);
  applyQuote(c, p, { price: sell, time: T0 + days * DAY }, 1, T0 + days * DAY);
  closeManual(c, p.id, T0 + days * DAY);
  return { c, p };
}

describe("IR estimado", () => {
  it("classifica ações, ETFs, BDRs e Polymarket", () => {
    expect(taxClassOf({ ...base, id: "a", ref: "PETR4.SA", amountBRL: 1, createdAt: 0, status: "fechada" })).toBe("acoes");
    expect(taxClassOf({ ...base, id: "a", ref: "KLBN11.SA", amountBRL: 1, createdAt: 0, status: "fechada" })).toBe("acoes");
    expect(taxClassOf({ ...base, id: "a", ref: "BOVA11.SA", amountBRL: 1, createdAt: 0, status: "fechada" })).toBe("etf_bdr");
    expect(taxClassOf({ ...base, id: "a", ref: "A1MD34.SA", amountBRL: 1, createdAt: 0, status: "fechada" })).toBe("etf_bdr");
    expect(taxClassOf({ ...base, id: "a", ref: "123", area: "polymarket", amountBRL: 1, createdAt: 0, status: "fechada" })).toBe("exterior");
  });

  it("ações com vendas até R$ 20 mil no mês são isentas", () => {
    const { c } = trade("PETR4.SA", 40, 44);
    const r = estimateTax(c);
    expect(r.lines[0].gain).toBeCloseTo(100);
    expect(r.total).toBe(0);
  });

  it("ETF paga 15% sobre o lucro mesmo com vendas pequenas", () => {
    const { c } = trade("BOVA11.SA", 100, 110);
    expect(estimateTax(c).total).toBeCloseTo(15);
  });

  it("day trade paga 20%", () => {
    const { c } = trade("PETR4.SA", 40, 44, 1000, 0);
    expect(estimateTax(c).total).toBeCloseTo(20);
  });

  it("prejuízo não paga imposto", () => {
    const { c } = trade("BOVA11.SA", 100, 90);
    expect(estimateTax(c).total).toBe(0);
  });
});
