import type { Area, Carteira, CarteiraEvent, Position, Quote } from "./types";

const DAY = 86_400_000;

export const AREAS: Area[] = ["bolsa", "polymarket"];
const AREA_NAME: Record<Area, string> = { bolsa: "Bolsa", polymarket: "Polymarket" };

/**
 * Cria a carteira. Cada área (Bolsa e Polymarket) tem o próprio caixa.
 * Sem `split`, o dinheiro é dividido meio a meio.
 */
export function emptyCarteira(cash: number, now = Date.now(), days: number | null = 7, split?: Record<Area, number>): Carteira {
  const s = split ?? { bolsa: cash / 2, polymarket: cash / 2 };
  const total = s.bolsa + s.polymarket;
  return {
    startCash: total,
    cash: total,
    wallets: { bolsa: { cash: s.bolsa, start: s.bolsa }, polymarket: { cash: s.polymarket, start: s.polymarket } },
    createdAt: now,
    endsAt: days ? now + days * DAY : null,
    positions: [],
    events: [{ t: now, kind: "info", text: `Carteira de teste criada: ${brl(s.bolsa)} na Bolsa e ${brl(s.polymarket)} no Polymarket (fictícios).` }],
    equity: [{ t: now, value: total, base: total }],
    lastCheck: null,
    lastError: null,
  };
}

/**
 * Carteiras antigas tinham um caixa só. Divide o dinheiro entre as áreas pelo que cada uma tem aplicado:
 * cada área começa com metade, e o caixa dela é o começo − o que está aplicado + o que já ganhou ou perdeu.
 */
export function ensureWallets(c: Carteira): Carteira {
  if (c.wallets) return c;
  const start = c.startCash / 2;
  const w = {} as NonNullable<Carteira["wallets"]>;
  for (const a of AREAS) {
    const ps = c.positions.filter((p) => p.area === a);
    const committed = ps.filter((p) => p.status !== "fechada").reduce((s, p) => s + p.amountBRL, 0);
    const realized = ps.filter((p) => p.status === "fechada").reduce((s, p) => s + (p.pnlBRL ?? 0), 0);
    const divs = ps.filter((p) => p.status !== "fechada").reduce((s, p) => s + (p.divBRL ?? 0), 0);
    w[a] = { cash: start - committed + realized + divs, start };
  }
  // Ajusta arredondamentos e evita caixa negativo, mantendo a soma igual ao caixa total.
  const diff = c.cash - (w.bolsa.cash + w.polymarket.cash);
  w.polymarket.cash += diff;
  for (const [a, b] of [["bolsa", "polymarket"], ["polymarket", "bolsa"]] as const) {
    if (w[a].cash < 0) {
      w[b].cash += w[a].cash;
      w[b].start += w[a].cash;
      w[a].start -= w[a].cash;
      w[a].cash = 0;
    }
  }
  c.wallets = w;
  return c;
}

export function areaCash(c: Carteira, a: Area) {
  return ensureWallets(c).wallets![a].cash;
}

/** Toda entrada e saída de dinheiro passa por aqui: mantém o caixa da área e o total juntos. */
function addCash(c: Carteira, a: Area, x: number) {
  ensureWallets(c).wallets![a].cash += x;
  c.cash += x;
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
  return positionValue(p) + (p.divBRL ?? 0) - p.amountBRL;
}

export function totalValue(c: Carteira): number {
  return c.cash + c.positions.reduce((s, p) => s + positionValue(p), 0);
}

/** Reserva o dinheiro e cria a ordem. A compra acontece na próxima leitura de preço. */
export function placeOrder(
  c: Carteira,
  o: Pick<Position, "area" | "ref" | "label" | "sub" | "currency" | "amountBRL" | "stopPct" | "holdDays" | "wholeShares" | "side">,
  now = Date.now(),
): Position {
  if (!(o.amountBRL > 0)) throw new Error("Valor precisa ser maior que zero");
  const free = areaCash(c, o.area);
  if (o.amountBRL > free + 1e-6) throw new Error(`Saldo insuficiente no caixa ${o.area === "bolsa" ? "da Bolsa" : "do Polymarket"}: disponível ${brl(free)}`);
  const p: Position = { ...o, id: `${o.area}-${o.ref}-${now.toString(36)}`, createdAt: now, status: "pendente" };
  addCash(c, o.area, -o.amountBRL);
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
  p.pnlBRL = value + (p.divBRL ?? 0) - p.amountBRL;
  addCash(c, p.area, value);
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
      addCash(c, p.area, p.amountBRL);
      log(c, { t: now, kind: "info", text: `Ordem de ${p.label} cancelada: o mercado encerrou antes da compra.` });
      return;
    }
    if (q.time <= p.createdAt || !(q.price > 0)) return;
    const unitBRL = (p.currency === "USD" ? fx : 1) * q.price;
    let qty = p.amountBRL / unitBRL;
    if (p.wholeShares) {
      // Como na B3: compra só ações inteiras; o troco volta para o caixa.
      qty = Math.floor(qty + 1e-9);
      if (qty < 1) {
        p.status = "fechada";
        p.closedAt = now;
        p.exitReason = "manual";
        p.pnlBRL = 0;
        p.qty = 0;
        addCash(c, p.area, p.amountBRL);
        log(c, { t: now, kind: "info", text: `Ordem de ${p.label} cancelada: ${brl(p.amountBRL)} não compra nem 1 ação (custa ${brl(unitBRL)}).` });
        return;
      }
      const spent = qty * unitBRL;
      addCash(c, p.area, p.amountBRL - spent);
      p.amountBRL = spent;
    }
    p.status = "aberta";
    p.filledAt = now;
    p.entryPrice = q.price;
    p.fxEntry = fx;
    p.qty = qty;
    p.exitAt = now + p.holdDays * DAY;
    p.lastPrice = q.price;
    p.lastAt = q.time;
    p.minPrice = q.price;
    p.maxPrice = q.price;
    log(c, {
      t: now,
      kind: "compra",
      text: `Comprou ${p.wholeShares ? `${qty} un. de ` : ""}${p.label} a ${fmtPrice(q.price, p)} (${brl(p.amountBRL)})${p.stopPct ? `, stop em ${fmtPrice(q.price * (1 - p.stopPct), p)}` : ""}.`,
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

/**
 * Credita um dividendo se a posição já estava comprada antes da data ex.
 * Valor bruto (juros sobre capital próprio têm 15% de IR na fonte; não descontado aqui).
 */
export function applyDividend(c: Carteira, p: Position, d: { date: number; amount: number }, fx: number, now = Date.now()) {
  if (p.status !== "aberta" || !p.filledAt || !p.qty) return;
  if (d.date * 1000 <= p.filledAt || d.date * 1000 > now) return;
  if (p.divPaid?.includes(d.date)) return;
  const value = p.qty * d.amount * (p.currency === "USD" ? fx : 1);
  p.divPaid = [...(p.divPaid ?? []), d.date];
  p.divBRL = (p.divBRL ?? 0) + value;
  addCash(c, p.area, value);
  log(c, { t: now, kind: "info", text: `Recebeu ${brl(value)} de dividendos de ${p.label}.` });
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
    addCash(c, p.area, p.amountBRL);
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
    const free = areaCash(c, p.area);
    if (delta > free + 1e-6) throw new Error(`Saldo insuficiente no caixa ${p.area === "bolsa" ? "da Bolsa" : "do Polymarket"}: disponível ${brl(free)}`);
    addCash(c, p.area, -delta);
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


/**
 * Muda a duração do teste, coloca mais dinheiro fictício numa área ou transfere entre as áreas.
 * Depósitos e transferências mudam o "começo" de cada área, para não contarem como lucro.
 */
export function editCarteira(
  c: Carteira,
  e: { dias?: number | null; deposito?: number; area?: Area; transferir?: { de: Area; para: Area; valor: number } },
  now = Date.now(),
) {
  ensureWallets(c);
  if (e.dias !== undefined) {
    c.endsAt = e.dias ? c.createdAt + e.dias * DAY : null;
    log(c, { t: now, kind: "info", text: e.dias ? `Duração do teste alterada para ${e.dias} dias.` : "Teste sem data para acabar." });
  }
  if (e.deposito) {
    if (!(e.deposito > 0)) throw new Error("Valor inválido");
    const a = e.area ?? "bolsa";
    addCash(c, a, e.deposito);
    c.wallets![a].start += e.deposito;
    c.startCash += e.deposito;
    log(c, { t: now, kind: "info", text: `Adicionou ${brl(e.deposito)} fictícios ao caixa ${a === "bolsa" ? "da Bolsa" : "do Polymarket"}.` });
  }
  if (e.transferir) {
    const { de, para, valor } = e.transferir;
    if (de === para || !(valor > 0)) throw new Error("Transferência inválida");
    if (valor > c.wallets![de].cash + 1e-6) throw new Error(`O caixa ${de === "bolsa" ? "da Bolsa" : "do Polymarket"} só tem ${brl(c.wallets![de].cash)} livres`);
    addCash(c, de, -valor);
    addCash(c, para, valor);
    c.wallets![de].start -= valor;
    c.wallets![para].start += valor;
    log(c, { t: now, kind: "info", text: `Transferiu ${brl(valor)} do caixa ${AREA_NAME[de]} para o caixa ${AREA_NAME[para]}.` });
  }
}

export interface AreaSummary {
  /** Dinheiro livre no caixa da área. */
  cash: number;
  /** Dinheiro colocado na área (depósitos e transferências). */
  start: number;
  /** Caixa + reservado + valor das posições. */
  patrimonio: number;
  /** Patrimônio da área sobre o dinheiro colocado nela. */
  retStart: number;
  /** Posições abertas (já compradas). */
  open: number;
  /** Ordens esperando para comprar. */
  pending: number;
  /** Dinheiro reservado em ordens pendentes. */
  reserved: number;
  /** Custo das posições abertas. */
  invested: number;
  /** Valor de mercado das posições abertas. */
  value: number;
  /** Lucro/prejuízo das abertas (inclui dividendos recebidos). */
  unrealized: number;
  /** Lucro/prejuízo das encerradas. */
  realized: number;
  total: number;
  /** Resultado sobre todo o dinheiro que já entrou em operações dessa área. */
  ret: number;
  wins: number;
  losses: number;
  /** Melhor e pior operação (encerrada ou aberta), em reais. */
  best: { label: string; pnl: number } | null;
  worst: { label: string; pnl: number } | null;
}

/** Resultado separado de uma área (Bolsa ou Polymarket). */
export function areaSummary(c: Carteira, area: Position["area"]): AreaSummary {
  const ps = c.positions.filter((p) => p.area === area && !(p.status === "fechada" && !p.entryPrice));
  const open = ps.filter((p) => p.status === "aberta");
  const closed = ps.filter((p) => p.status === "fechada");
  const pending = ps.filter((p) => p.status === "pendente");
  const invested = open.reduce((s, p) => s + p.amountBRL, 0);
  const unrealized = open.reduce((s, p) => s + positionPnl(p), 0);
  const realized = closed.reduce((s, p) => s + (p.pnlBRL ?? 0), 0);
  const deployed = [...open, ...closed].reduce((s, p) => s + p.amountBRL, 0);
  const ranked = [...open, ...closed].map((p) => ({ label: p.label, pnl: positionPnl(p) })).sort((a, b) => b.pnl - a.pnl);
  const w = ensureWallets(c).wallets![area];
  const patrimonio = w.cash + pending.reduce((s, p) => s + p.amountBRL, 0) + open.reduce((s, p) => s + positionValue(p), 0);
  return {
    cash: w.cash,
    start: w.start,
    patrimonio,
    retStart: w.start ? patrimonio / w.start - 1 : 0,
    open: open.length,
    pending: pending.length,
    reserved: pending.reduce((s, p) => s + p.amountBRL, 0),
    invested,
    value: open.reduce((s, p) => s + positionValue(p), 0),
    unrealized,
    realized,
    total: unrealized + realized,
    ret: deployed ? (unrealized + realized) / deployed : 0,
    wins: closed.filter((p) => (p.pnlBRL ?? 0) > 0).length,
    losses: closed.filter((p) => (p.pnlBRL ?? 0) <= 0).length,
    best: ranked[0] ?? null,
    worst: ranked.length > 1 ? ranked[ranked.length - 1] : null,
  };
}

/**
 * Divide o dinheiro em ações inteiras perseguindo os pesos-alvo.
 * Primeiro compra o que cabe em cada alvo; depois usa o troco comprando 1 ação por vez
 * de quem está mais longe do alvo, enquanto couber (mesmo passando um pouco do alvo: com pouco dinheiro,
 * uma ação cara como IVVB11 pode não caber e o dinheiro dela vai para as outras).
 * `buffer` reserva margem para o preço subir até a compra.
 */
export function allocateWholeShares(targets: { key: string; price: number; weight: number }[], cash: number, buffer = 1.02) {
  const valid = targets.filter((t) => t.price > 0 && t.weight > 0);
  const wSum = valid.reduce((s, t) => s + t.weight, 0) || 1;
  const unit = (t: (typeof valid)[number]) => t.price * buffer;
  const shares = new Map(valid.map((t) => [t.key, Math.floor(((cash * t.weight) / wSum) / unit(t))]));
  let left = cash - valid.reduce((s, t) => s + shares.get(t.key)! * unit(t), 0);
  for (let guard = 0; guard < 10_000; guard++) {
    const cands = valid
      .filter((t) => unit(t) <= left + 1e-9)
      .map((t) => ({ t, gap: (cash * t.weight) / wSum - shares.get(t.key)! * unit(t) }))
      .sort((a, b) => b.gap - a.gap);
    if (!cands.length) break;
    const t = cands[0].t;
    shares.set(t.key, shares.get(t.key)! + 1);
    left -= unit(t);
  }
  return valid.map((t) => ({ key: t.key, shares: shares.get(t.key)!, amount: shares.get(t.key)! * unit(t) })).filter((x) => x.shares > 0);
}

/** Guarda um ponto do patrimônio no máximo a cada `everyMs`. */
export function recordEquity(c: Carteira, now = Date.now(), everyMs = 10 * 60_000) {
  const v = totalValue(c);
  const last = c.equity[c.equity.length - 1];
  const pnlBolsa = areaSummary(c, "bolsa").total;
  const pnlPoly = areaSummary(c, "polymarket").total;
  if (!last || now - last.t >= everyMs || last.base !== c.startCash) c.equity.push({ t: now, value: v, base: c.startCash, pnlBolsa, pnlPoly });
  else Object.assign(last, { value: v, pnlBolsa, pnlPoly });
  if (c.equity.length > 3000) c.equity.splice(0, c.equity.length - 3000);
}

function fmtPrice(n: number, p: Position) {
  if (p.area === "polymarket") return `${(n * 100).toFixed(1)}¢`;
  const s = n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: n < 1 ? 4 : 2 });
  return p.currency === "USD" ? `US$ ${s}` : `R$ ${s}`;
}
