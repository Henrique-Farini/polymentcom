import type { Carteira, CarteiraEvent, Position, Quote } from "./types";

const DAY = 86_400_000;

export function emptyCarteira(cash: number, now = Date.now(), days: number | null = 7): Carteira {
  return {
    startCash: cash,
    cash,
    createdAt: now,
    endsAt: days ? now + days * DAY : null,
    positions: [],
    events: [{ t: now, kind: "info", text: `Carteira de teste criada com ${brl(cash)} fictícios.` }],
    equity: [{ t: now, value: cash }],
    lastCheck: null,
    lastError: null,
  };
}

export const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pc = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(2)}%`;

/** Valor atual da posição em reais. Pendente vale o que foi reservado. */
export function positionValue(p: Position): number {
  if (p.status === "pendente") return p.amountBRL;
  if (p.status === "fechada") return 0;
  return (p.qty ?? 0) * (p.lastPrice ?? p.entryPrice ?? 0) * (p.currency === "USD" ? p.fxLast ?? p.fxEntry ?? 1 : 1);
}

export function positionPnl(p: Position): number {
  if (p.status === "fechada") return p.pnlBRL ?? 0;
  if (p.status === "pendente") return 0;
  return positionValue(p) - p.amountBRL;
}

export function totalValue(c: Carteira): number {
  return c.cash + c.positions.reduce((s, p) => s + positionValue(p), 0);
}

/** Reserva o dinheiro e cria a ordem. A compra acontece na próxima leitura de preço. */
export function placeOrder(
  c: Carteira,
  o: Pick<Position, "area" | "ref" | "label" | "sub" | "currency" | "amountBRL" | "stopPct" | "holdDays">,
  now = Date.now(),
): Position {
  if (!(o.amountBRL > 0)) throw new Error("Valor precisa ser maior que zero");
  if (o.amountBRL > c.cash + 1e-6) throw new Error(`Saldo insuficiente: disponível ${brl(c.cash)}`);
  const p: Position = { ...o, id: `${o.area}-${o.ref}-${now.toString(36)}`, createdAt: now, status: "pendente" };
  c.cash -= o.amountBRL;
  c.positions.push(p);
  return p;
}

function log(c: Carteira, e: CarteiraEvent) {
  c.events.push(e);
  if (c.events.length > 300) c.events.splice(0, c.events.length - 300);
}

function close(c: Carteira, p: Position, price: number, reason: Position["exitReason"], now: number) {
  p.status = "fechada";
  p.closedAt = now;
  p.exitPrice = price;
  p.exitReason = reason;
  p.lastPrice = price;
  const fx = p.currency === "USD" ? p.fxLast ?? p.fxEntry ?? 1 : 1;
  const value = (p.qty ?? 0) * price * fx;
  p.pnlBRL = value - p.amountBRL;
  c.cash += value;
  const ret = p.pnlBRL / p.amountBRL;
  const why =
    reason === "stop"
      ? `stop de ${Math.round((p.stopPct ?? 0) * 100)}% atingido`
      : reason === "prazo"
        ? "prazo encerrado"
        : reason === "resolvido"
          ? "mercado resolvido"
          : "venda manual";
  log(c, {
    t: now,
    kind: reason === "stop" ? "stop" : reason === "prazo" || reason === "resolvido" ? "prazo" : "venda",
    text: `Vendeu ${p.label} (${why}): ${brl(value)}, resultado ${p.pnlBRL >= 0 ? "+" : ""}${brl(p.pnlBRL)} (${pc(ret)}).`,
  });
}

/**
 * Aplica uma leitura de preço a uma posição.
 * - Pendente: compra assim que houver negócio depois da ordem (pregão aberto).
 * - Aberta: vende se tocar o stop, se o prazo acabar ou se o mercado for resolvido.
 */
export function applyQuote(c: Carteira, p: Position, q: Quote, fx: number, now = Date.now()) {
  if (p.status === "fechada" || !(q.price >= 0)) return;
  p.fxLast = fx;

  if (p.status === "pendente") {
    if (q.resolved) {
      // Mercado acabou antes de comprar: devolve o dinheiro.
      p.status = "fechada";
      p.closedAt = now;
      p.exitReason = "resolvido";
      p.pnlBRL = 0;
      p.qty = 0;
      c.cash += p.amountBRL;
      log(c, { t: now, kind: "info", text: `Ordem de ${p.label} cancelada: o mercado encerrou antes da compra.` });
      return;
    }
    if (q.time <= p.createdAt || !(q.price > 0)) return;
    p.status = "aberta";
    p.filledAt = now;
    p.entryPrice = q.price;
    p.fxEntry = fx;
    p.qty = p.amountBRL / ((p.currency === "USD" ? fx : 1) * q.price);
    p.exitAt = now + p.holdDays * DAY;
    p.lastPrice = q.price;
    p.lastAt = q.time;
    p.minPrice = q.price;
    p.maxPrice = q.price;
    log(c, {
      t: now,
      kind: "compra",
      text: `Comprou ${p.label} a ${fmtPrice(q.price, p)} com ${brl(p.amountBRL)}${p.stopPct ? `, stop em ${fmtPrice(q.price * (1 - p.stopPct), p)}` : ""}.`,
    });
    return;
  }

  p.lastPrice = q.price;
  p.lastAt = q.time;
  p.minPrice = Math.min(p.minPrice ?? q.price, q.price);
  p.maxPrice = Math.max(p.maxPrice ?? q.price, q.price);

  if (q.resolved) return close(c, p, q.price, "resolvido", now);
  if (p.stopPct && p.entryPrice && q.price <= p.entryPrice * (1 - p.stopPct)) return close(c, p, q.price, "stop", now);
  if (p.exitAt && now >= p.exitAt) return close(c, p, q.price, "prazo", now);
}

export function closeManual(c: Carteira, id: string, now = Date.now()) {
  const p = c.positions.find((x) => x.id === id);
  if (!p || p.status === "fechada") throw new Error("Posição não encontrada ou já fechada");
  if (p.status === "pendente") {
    p.status = "fechada";
    p.closedAt = now;
    p.exitReason = "manual";
    p.pnlBRL = 0;
    p.qty = 0;
    c.cash += p.amountBRL;
    log(c, { t: now, kind: "info", text: `Ordem de ${p.label} cancelada antes da compra.` });
    return;
  }
  close(c, p, p.lastPrice ?? p.entryPrice ?? 0, "manual", now);
}

export interface PositionEdit {
  amountBRL?: number;
  stopPct?: number | null;
  holdDays?: number;
}

/**
 * Altera uma posição. Ordem pendente: valor, stop e prazo. Posição já comprada: só stop e prazo
 * (mudar o valor seria comprar ou vender mais). O novo stop/prazo vale a partir da próxima leitura.
 */
export function editPosition(c: Carteira, id: string, e: PositionEdit, now = Date.now()) {
  const p = c.positions.find((x) => x.id === id);
  if (!p || p.status === "fechada") throw new Error("Posição não encontrada ou já fechada");
  const changes: string[] = [];
  if (e.amountBRL !== undefined && Math.abs(e.amountBRL - p.amountBRL) > 0.005) {
    if (p.status !== "pendente") throw new Error("Depois da compra o valor não muda: venda e compre de novo");
    if (!(e.amountBRL > 0)) throw new Error("Valor precisa ser maior que zero");
    const delta = e.amountBRL - p.amountBRL;
    if (delta > c.cash + 1e-6) throw new Error(`Saldo insuficiente: disponível ${brl(c.cash)}`);
    c.cash -= delta;
    changes.push(`valor ${brl(p.amountBRL)} → ${brl(e.amountBRL)}`);
    p.amountBRL = e.amountBRL;
  }
  if (e.stopPct !== undefined && e.stopPct !== p.stopPct) {
    const f = (s: number | null) => (s ? `${Math.round(s * 100)}%` : "sem stop");
    changes.push(`stop ${f(p.stopPct)} → ${f(e.stopPct)}`);
    p.stopPct = e.stopPct;
  }
  if (e.holdDays !== undefined && e.holdDays !== p.holdDays) {
    if (!(e.holdDays >= 1)) throw new Error("Prazo mínimo de 1 dia");
    changes.push(`prazo ${p.holdDays} → ${e.holdDays} dias`);
    p.holdDays = e.holdDays;
    if (p.filledAt) p.exitAt = p.filledAt + e.holdDays * DAY;
  }
  if (changes.length) log(c, { t: now, kind: "info", text: `Alterou ${p.label}: ${changes.join(", ")}.` });
}

/** Muda a duração do teste e/ou coloca mais dinheiro fictício. */
export function editCarteira(c: Carteira, e: { dias?: number | null; deposito?: number }, now = Date.now()) {
  if (e.dias !== undefined) {
    c.endsAt = e.dias ? c.createdAt + e.dias * DAY : null;
    log(c, { t: now, kind: "info", text: e.dias ? `Duração do teste alterada para ${e.dias} dias.` : "Teste sem data para acabar." });
  }
  if (e.deposito) {
    if (!(e.deposito > 0)) throw new Error("Valor inválido");
    c.cash += e.deposito;
    c.startCash += e.deposito;
    log(c, { t: now, kind: "info", text: `Adicionou ${brl(e.deposito)} fictícios.` });
  }
}

/** Guarda um ponto do patrimônio no máximo a cada `everyMs`. */
export function recordEquity(c: Carteira, now = Date.now(), everyMs = 10 * 60_000) {
  const v = totalValue(c);
  const last = c.equity[c.equity.length - 1];
  if (!last || now - last.t >= everyMs) c.equity.push({ t: now, value: v });
  else last.value = v;
  if (c.equity.length > 3000) c.equity.splice(0, c.equity.length - 3000);
}

function fmtPrice(n: number, p: Position) {
  if (p.area === "polymarket") return `${(n * 100).toFixed(1)}¢`;
  const s = n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: n < 1 ? 4 : 2 });
  return p.currency === "USD" ? `US$ ${s}` : `R$ ${s}`;
}
