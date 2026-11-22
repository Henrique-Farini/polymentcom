import { describe, expect, it } from "vitest";
import { applyQuote, closeManual, editCarteira, editPosition, emptyCarteira, placeOrder, positionPnl, recordEquity, totalValue } from "@/lib/carteira/engine";

const T0 = 1_700_000_000_000;
const order = { area: "bolsa" as const, ref: "PETR4.SA", label: "PETR4", sub: "Petrobras", currency: "BRL" as const, amountBRL: 1000, stopPct: 0.08, holdDays: 7 };

describe("carteira de teste", () => {
  it("reserva o dinheiro e só compra com negócio depois da ordem", () => {
    const c = emptyCarteira(10_000, T0);
    const p = placeOrder(c, order, T0);
    expect(c.cash).toBe(9000);
    expect(totalValue(c)).toBe(10_000);
    applyQuote(c, p, { price: 40, time: T0 - 1000 }, 1, T0 + 1000); // preço antigo (pregão fechado)
    expect(p.status).toBe("pendente");
    applyQuote(c, p, { price: 40, time: T0 + 5000 }, 1, T0 + 6000);
    expect(p.status).toBe("aberta");
    expect(p.qty).toBeCloseTo(25);
  });

  it("vende no stop", () => {
    const c = emptyCarteira(10_000, T0);
    const p = placeOrder(c, order, T0);
    applyQuote(c, p, { price: 40, time: T0 + 1 }, 1, T0 + 1);
    applyQuote(c, p, { price: 38, time: T0 + 2 }, 1, T0 + 2);
    expect(p.status).toBe("aberta");
    expect(positionPnl(p)).toBeCloseTo(-50);
    applyQuote(c, p, { price: 36.5, time: T0 + 3 }, 1, T0 + 3);
    expect(p.status).toBe("fechada");
    expect(p.exitReason).toBe("stop");
    expect(c.cash).toBeCloseTo(9000 + 25 * 36.5);
    expect(c.events.at(-1)?.kind).toBe("stop");
  });

  it("vende quando o prazo acaba", () => {
    const c = emptyCarteira(10_000, T0);
    const p = placeOrder(c, { ...order, holdDays: 1 }, T0);
    applyQuote(c, p, { price: 40, time: T0 + 1 }, 1, T0 + 1);
    applyQuote(c, p, { price: 44, time: T0 + 86_400_001 }, 1, T0 + 86_400_002);
    expect(p.exitReason).toBe("prazo");
    expect(p.pnlBRL).toBeCloseTo(100);
  });

  it("converte dólar e mede o resultado em reais", () => {
    const c = emptyCarteira(10_000, T0);
    const p = placeOrder(c, { ...order, ref: "AAPL", currency: "USD" }, T0);
    applyQuote(c, p, { price: 200, time: T0 + 1 }, 5, T0 + 1); // US$ 200 com dólar a R$ 5
    expect(p.qty).toBeCloseTo(1);
    applyQuote(c, p, { price: 200, time: T0 + 2 }, 5.5, T0 + 2); // ação parada, dólar subiu 10%
    expect(positionPnl(p)).toBeCloseTo(100);
  });

  it("Polymarket resolvido paga $1 ou zero", () => {
    const c = emptyCarteira(10_000, T0);
    const p = placeOrder(c, { ...order, area: "polymarket", ref: "123", currency: "USD", stopPct: null }, T0);
    applyQuote(c, p, { price: 0.5, time: T0 + 1 }, 5, T0 + 1);
    applyQuote(c, p, { price: 1, time: T0 + 2, resolved: true }, 5, T0 + 2);
    expect(p.exitReason).toBe("resolvido");
    expect(p.pnlBRL).toBeCloseTo(1000);
  });

  it("não deixa gastar mais que o saldo e cancela pendente devolvendo o dinheiro", () => {
    const c = emptyCarteira(1000, T0);
    expect(() => placeOrder(c, { ...order, amountBRL: 2000 }, T0)).toThrow();
    const p = placeOrder(c, order, T0);
    closeManual(c, p.id, T0 + 1);
    expect(c.cash).toBe(1000);
  });

  it("edita ordem pendente (valor, stop, prazo) e só stop/prazo depois da compra", () => {
    const c = emptyCarteira(1000, T0);
    const p = placeOrder(c, { ...order, amountBRL: 700 }, T0);
    editPosition(c, p.id, { amountBRL: 400, stopPct: 0.1, holdDays: 3 }, T0 + 1);
    expect(c.cash).toBe(600);
    expect(p.stopPct).toBe(0.1);
    expect(() => editPosition(c, p.id, { amountBRL: 2000 })).toThrow();
    applyQuote(c, p, { price: 40, time: T0 + 2 }, 1, T0 + 2);
    expect(() => editPosition(c, p.id, { amountBRL: 500 })).toThrow();
    editPosition(c, p.id, { holdDays: 1, stopPct: null }, T0 + 3);
    expect(p.exitAt).toBe(T0 + 2 + 86_400_000);
    expect(p.stopPct).toBeNull();
  });

  it("muda a duração e deposita mais dinheiro fictício", () => {
    const c = emptyCarteira(1000, T0);
    editCarteira(c, { dias: 14, deposito: 9000 }, T0 + 1);
    expect(c.endsAt).toBe(T0 + 14 * 86_400_000);
    expect(c.cash).toBe(10_000);
    expect(c.startCash).toBe(10_000);
  });

  it("grava o patrimônio sem repetir pontos muito próximos", () => {
    const c = emptyCarteira(1000, T0);
    recordEquity(c, T0 + 1000);
    expect(c.equity.length).toBe(1);
    recordEquity(c, T0 + 11 * 60_000);
    expect(c.equity.length).toBe(2);
  });
});
