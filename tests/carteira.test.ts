import { describe, expect, it } from "vitest";
import { allocateWholeShares, applyDividend, applyQuote, areaCash, autopilotDue, areaSummary, ensureWallets, closeManual, editCarteira, editPosition, emptyCarteira, placeOrder, positionPnl, recordEquity, totalValue } from "@/lib/carteira/engine";

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
    const c = emptyCarteira(1000, T0, 7, { bolsa: 1000, polymarket: 0 });
    expect(() => placeOrder(c, { ...order, amountBRL: 2000 }, T0)).toThrow();
    const p = placeOrder(c, order, T0);
    closeManual(c, p.id, T0 + 1);
    expect(c.cash).toBe(1000);
  });

  it("edita ordem pendente (valor, stop, prazo) e só stop/prazo depois da compra", () => {
    const c = emptyCarteira(1000, T0, 7, { bolsa: 1000, polymarket: 0 });
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
    const c = emptyCarteira(1000, T0, 7, { bolsa: 1000, polymarket: 0 });
    editCarteira(c, { dias: 14, deposito: 9000 }, T0 + 1);
    expect(c.endsAt).toBe(T0 + 14 * 86_400_000);
    expect(c.cash).toBe(10_000);
    expect(c.startCash).toBe(10_000);
  });

  it("grava o patrimônio sem repetir pontos muito próximos", () => {
    const c = emptyCarteira(1000, T0, 7, { bolsa: 1000, polymarket: 0 });
    recordEquity(c, T0 + 1000);
    expect(c.equity.length).toBe(1);
    recordEquity(c, T0 + 11 * 60_000);
    expect(c.equity.length).toBe(2);
  });
});

describe("realismo da B3", () => {
  it("compra só ações inteiras e devolve o troco", () => {
    const c = emptyCarteira(1000, T0, 7, { bolsa: 1000, polymarket: 0 });
    const p = placeOrder(c, { ...order, amountBRL: 175, wholeShares: true }, T0);
    applyQuote(c, p, { price: 40, time: T0 + 1 }, 1, T0 + 1);
    expect(p.qty).toBe(4);
    expect(p.amountBRL).toBe(160);
    expect(c.cash).toBe(840);
  });

  it("cancela quando o valor não compra nem 1 ação", () => {
    const c = emptyCarteira(1000, T0);
    const p = placeOrder(c, { ...order, amountBRL: 30, wholeShares: true }, T0);
    applyQuote(c, p, { price: 40, time: T0 + 1 }, 1, T0 + 1);
    expect(p.status).toBe("fechada");
    expect(c.cash).toBe(1000);
  });

  it("credita dividendo só para quem comprou antes da data ex, uma vez", () => {
    const c = emptyCarteira(1000, T0);
    const p = placeOrder(c, { ...order, amountBRL: 400, wholeShares: true }, T0);
    applyQuote(c, p, { price: 40, time: T0 + 1 }, 1, T0 + 1);
    const cash = c.cash;
    applyDividend(c, p, { date: (T0 - 86_400_000) / 1000, amount: 1 }, 1, T0 + 2); // antes da compra
    expect(c.cash).toBe(cash);
    const ex = (T0 + 86_400_000) / 1000;
    applyDividend(c, p, { date: ex, amount: 1 }, 1, T0 + 2 * 86_400_000);
    applyDividend(c, p, { date: ex, amount: 1 }, 1, T0 + 2 * 86_400_000);
    expect(c.cash).toBe(cash + 10);
    expect(positionPnl(p)).toBeCloseTo(10);
  });
});

describe("allocateWholeShares", () => {
  it("respeita o dinheiro, compra ações inteiras e usa o troco em quem está mais longe do alvo", () => {
    const r = allocateWholeShares(
      [
        { key: "BOVA11", price: 163, weight: 1 },
        { key: "IVVB11", price: 481, weight: 1 },
        { key: "PETR4", price: 42, weight: 1 },
      ],
      700,
      1,
    );
    const spent = r.reduce((s, x) => s + x.amount, 0);
    expect(spent).toBeLessThanOrEqual(700);
    expect(r.every((x) => Number.isInteger(x.shares))).toBe(true);
    expect(r.find((x) => x.key === "BOVA11")?.shares).toBeGreaterThanOrEqual(1);
    expect(700 - spent).toBeLessThan(42); // o troco não compra mais nenhuma ação
  });

  it("devolve vazio quando nada cabe", () => {
    expect(allocateWholeShares([{ key: "X", price: 1000, weight: 1 }], 100)).toEqual([]);
  });
});

describe("areaSummary", () => {
  it("separa o resultado da Bolsa e do Polymarket", () => {
    const c = emptyCarteira(10_000, T0);
    const b = placeOrder(c, { ...order, amountBRL: 1000 }, T0);
    applyQuote(c, b, { price: 40, time: T0 + 1 }, 1, T0 + 1);
    applyQuote(c, b, { price: 44, time: T0 + 2 }, 1, T0 + 2); // +100 em aberto
    const p = placeOrder(c, { ...order, area: "polymarket", ref: "9", currency: "USD", stopPct: null, amountBRL: 500 }, T0);
    applyQuote(c, p, { price: 0.25, time: T0 + 1 }, 5, T0 + 1);
    applyQuote(c, p, { price: 1, time: T0 + 3, resolved: true }, 5, T0 + 3); // +1500 realizado
    const pend = placeOrder(c, { ...order, amountBRL: 300 }, T0 + 4);

    const sb = areaSummary(c, "bolsa");
    expect(sb.unrealized).toBeCloseTo(100);
    expect(sb.realized).toBe(0);
    expect(sb.pending).toBe(1);
    expect(sb.reserved).toBe(300);
    expect(sb.ret).toBeCloseTo(0.1);

    const sp = areaSummary(c, "polymarket");
    expect(sp.realized).toBeCloseTo(1500);
    expect(sp.wins).toBe(1);
    expect(sp.ret).toBeCloseTo(3);
    expect(pend.status).toBe("pendente");
  });
});

describe("caixas separados", () => {
  it("a Bolsa não usa o dinheiro do Polymarket, e vice-versa", () => {
    const c = emptyCarteira(2000, T0, 7, { bolsa: 1000, polymarket: 1000 });
    expect(() => placeOrder(c, { ...order, amountBRL: 1500 }, T0)).toThrow(/Bolsa/);
    placeOrder(c, { ...order, amountBRL: 1000 }, T0);
    expect(areaCash(c, "bolsa")).toBe(0);
    expect(areaCash(c, "polymarket")).toBe(1000);
    expect(c.cash).toBe(1000);
  });

  it("o lucro volta para o caixa da área certa", () => {
    const c = emptyCarteira(2000, T0, 7, { bolsa: 1000, polymarket: 1000 });
    const p = placeOrder(c, { ...order, area: "polymarket", ref: "9", currency: "USD", stopPct: null, amountBRL: 500 }, T0);
    applyQuote(c, p, { price: 0.5, time: T0 + 1 }, 5, T0 + 1);
    applyQuote(c, p, { price: 1, time: T0 + 2, resolved: true }, 5, T0 + 2);
    expect(areaCash(c, "polymarket")).toBeCloseTo(1500);
    expect(areaCash(c, "bolsa")).toBe(1000);
    expect(areaSummary(c, "polymarket").retStart).toBeCloseTo(0.5);
  });

  it("depósito e transferência não contam como lucro", () => {
    const c = emptyCarteira(2000, T0, 7, { bolsa: 1000, polymarket: 1000 });
    editCarteira(c, { deposito: 500, area: "polymarket" }, T0 + 1);
    editCarteira(c, { transferir: { de: "bolsa", para: "polymarket", valor: 300 } }, T0 + 2);
    expect(areaCash(c, "bolsa")).toBe(700);
    expect(areaCash(c, "polymarket")).toBe(1800);
    expect(areaSummary(c, "bolsa").retStart).toBeCloseTo(0);
    expect(areaSummary(c, "polymarket").retStart).toBeCloseTo(0);
    expect(() => editCarteira(c, { transferir: { de: "bolsa", para: "polymarket", valor: 5000 } })).toThrow();
  });

  it("converte carteira antiga (caixa único) sem mudar o total", () => {
    const c = emptyCarteira(2000, T0, 7, { bolsa: 1000, polymarket: 1000 });
    placeOrder(c, { ...order, amountBRL: 800 }, T0);
    placeOrder(c, { ...order, area: "polymarket", ref: "9", currency: "USD", stopPct: null, amountBRL: 300 }, T0);
    const old = JSON.parse(JSON.stringify(c));
    delete old.wallets;
    ensureWallets(old);
    expect(old.wallets.bolsa.cash).toBeCloseTo(200);
    expect(old.wallets.polymarket.cash).toBeCloseTo(700);
    expect(old.wallets.bolsa.cash + old.wallets.polymarket.cash).toBeCloseTo(c.cash);
  });
});

describe("piloto automático", () => {
  const H = 3_600_000;
  const fresh = () => {
    const c = emptyCarteira(2000, T0, 7, { bolsa: 1000, polymarket: 1000 });
    c.auto = { on: true, antecedencia: "qualquer", everyHours: 3, maxNew: 5, reserva: 0.3 };
    return c;
  };

  it("roda logo no começo, nas duas áreas", () => {
    expect(autopilotDue(fresh(), T0 + 1)).toEqual({ poly: true, bolsa: true });
  });

  it("espera o intervalo para apostar de novo e respeita a reserva", () => {
    const c = fresh();
    c.auto!.lastPoly = T0;
    expect(autopilotDue(c, T0 + 2 * H).poly).toBe(false);
    expect(autopilotDue(c, T0 + 3 * H).poly).toBe(true);
    // só sobra a reserva (30%): não aposta
    placeOrder(c, { ...order, area: "polymarket", ref: "x", currency: "USD", stopPct: null, amountBRL: 700 }, T0);
    expect(autopilotDue(c, T0 + 4 * H).poly).toBe(false);
  });

  it("não remonta a Bolsa enquanto houver posição, e para quando o teste acaba", () => {
    const c = fresh();
    placeOrder(c, { ...order, amountBRL: 500 }, T0);
    expect(autopilotDue(c, T0 + 1).bolsa).toBe(false);
    expect(autopilotDue(c, T0 + 8 * 24 * H)).toEqual({ poly: false, bolsa: false });
    c.auto!.on = false;
    expect(autopilotDue(c, T0 + 1)).toEqual({ poly: false, bolsa: false });
  });
});
