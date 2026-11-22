import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getBolsaAnalysis } from "@/lib/analise/bolsa";
import { getAssets } from "@/lib/bolsa/server";
import { DEFAULT_UNIVERSE } from "@/lib/bolsa/universe";
import { pickPoly } from "@/lib/picks";
import { getMarketQuote, getMarkets } from "@/lib/polymarket/server";
import { DEFAULT_POLY_SETTINGS } from "@/lib/score/types";
import { applyQuote, brl, closeManual, editCarteira, editPosition, emptyCarteira, placeOrder, recordEquity, type PositionEdit } from "./engine";
import type { Carteira, Position, Quote } from "./types";

/**
 * A carteira fica num arquivo no computador (data/carteira.json) e o servidor confere os preços
 * a cada minuto, mesmo com o navegador fechado, enquanto o `npm run dev` estiver rodando.
 */

const FILE = path.join(process.cwd(), "data", "carteira.json");
const CHECK_EVERY = 60_000;

const g = globalThis as unknown as { __carteiraLock?: Promise<unknown>; __carteiraTimer?: ReturnType<typeof setInterval> };

/** Uma alteração por vez no arquivo. */
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = (g.__carteiraLock ?? Promise.resolve()).then(fn, fn);
  g.__carteiraLock = run.catch(() => undefined);
  return run;
}

async function load(): Promise<Carteira | null> {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf8")) as Carteira;
  } catch {
    return null;
  }
}

async function save(c: Carteira) {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  const tmp = `${FILE}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(c), "utf8");
  await fs.rename(tmp, FILE);
}

/** Busca os preços e aplica stop, prazo e compras pendentes. */
async function refresh(c: Carteira) {
  const now = Date.now();
  const live = c.positions.filter((p) => p.status !== "fechada");
  const bolsa = [...new Set(live.filter((p) => p.area === "bolsa").map((p) => p.ref))];
  const poly = live.filter((p) => p.area === "polymarket");

  const { assets } = await getAssets([...bolsa, "BRL=X"]);
  const fx = assets.find((a) => a.symbol === "BRL=X")?.price;
  if (!fx) throw new Error("Sem cotação do dólar agora");
  const bq = new Map<string, Quote>(assets.map((a) => [a.symbol, { price: a.price, time: a.marketTime }]));

  const list = poly.length ? (await getMarkets()).value : [];
  const pq = new Map<string, { bid: number; ask: number; resolved: boolean; price: number }>();
  for (const p of poly) {
    if (pq.has(p.ref)) continue;
    let m = list.find((x) => x.id === p.ref);
    let closed = false;
    if (!m) {
      const r = await getMarketQuote(p.ref);
      m = r.market;
      closed = r.closed;
    }
    const resolved = closed && (m.probability >= 0.99 || m.probability <= 0.01);
    pq.set(p.ref, {
      price: resolved ? Math.round(m.probability) : m.probability,
      bid: m.bestBid ?? m.probability,
      ask: m.bestAsk ?? m.probability,
      resolved,
    });
  }

  for (const p of live) {
    if (p.area === "bolsa") {
      const q = bq.get(p.ref);
      if (q) applyQuote(c, p, q, fx, now);
    } else {
      const q = pq.get(p.ref);
      if (!q) continue;
      // Compra pelo preço de venda do livro (ask); avalia pelo preço de compra (bid), como seria na vida real.
      const price = q.resolved ? q.price : p.status === "pendente" ? q.ask : q.bid;
      applyQuote(c, p, { price, time: now, resolved: q.resolved }, fx, now);
    }
  }
  recordEquity(c, now);
  c.lastCheck = now;
  c.lastError = null;
}

export function checkNow() {
  return withLock(async () => {
    const c = await load();
    if (!c) return null;
    try {
      await refresh(c);
    } catch (e) {
      c.lastCheck = Date.now();
      c.lastError = e instanceof Error ? e.message : String(e);
    }
    await save(c);
    return c;
  });
}

export async function getCarteira(maxAgeMs = 30_000) {
  const c = await load();
  if (c && (!c.lastCheck || Date.now() - c.lastCheck > maxAgeMs)) return checkNow();
  return c;
}

export function startLoop() {
  if (g.__carteiraTimer) return;
  g.__carteiraTimer = setInterval(() => {
    checkNow().catch(() => undefined);
  }, CHECK_EVERY);
}

/* ----------------------------- ações ----------------------------- */

export function novaCarteira(cash: number, days: number | null) {
  return withLock(async () => {
    const c = emptyCarteira(cash, Date.now(), days);
    await save(c);
    return c;
  });
}

export type NewOrder = Pick<Position, "area" | "ref" | "label" | "sub" | "currency" | "amountBRL" | "stopPct" | "holdDays">;

export async function ordem(o: NewOrder) {
  await withLock(async () => {
    const c = await load();
    if (!c) throw new Error("Crie a carteira primeiro");
    placeOrder(c, o);
    await save(c);
  });
  return checkNow();
}

export async function fechar(id: string) {
  await withLock(async () => {
    const c = await load();
    if (!c) throw new Error("Sem carteira");
    closeManual(c, id);
    recordEquity(c);
    await save(c);
  });
  return load();
}

export async function editar(id: string, e: PositionEdit) {
  await withLock(async () => {
    const c = await load();
    if (!c) throw new Error("Sem carteira");
    editPosition(c, id, e);
    recordEquity(c);
    await save(c);
  });
  return checkNow();
}

export async function editarTeste(e: { dias?: number | null; deposito?: number }) {
  await withLock(async () => {
    const c = await load();
    if (!c) throw new Error("Sem carteira");
    editCarteira(c, e);
    recordEquity(c);
    await save(c);
  });
  return load();
}

export interface AutoOptions {
  /** Fração do dinheiro para o Polymarket (0 a 0.3). */
  partePoly: number;
  /** Quantas ações na parte de momento. */
  nMomento: number;
  /** Stop só na parte de ações (null = sem stop; o backtest mostrou que stop piora). */
  stop: number | null;
  holdDays: number;
}

/** ETFs do núcleo: o mercado brasileiro e o americano inteiros. */
const CORE: { symbol: string; label: string; sub: string }[] = [
  { symbol: "BOVA11.SA", label: "BOVA11", sub: "ETF Ibovespa" },
  { symbol: "IVVB11.SA", label: "IVVB11", sub: "ETF S&P 500 em reais" },
];

/**
 * Regra nova (testada em 4 anos de dados): metade no núcleo (BOVA11 + IVVB11) e metade nas ações
 * com mais momento 12-1 (as que mais subiram em 12 meses, ignorando o último mês).
 * Polymarket: parte pequena, só em mercados que se resolvem dentro do prazo, segurados até o resultado.
 */
export async function montarAuto(o: AutoOptions) {
  const c0 = await load();
  if (!c0) throw new Error("Crie a carteira primeiro");
  const cash = c0.cash;
  const symbols = DEFAULT_UNIVERSE.map((u) => u.symbol);
  const stockSymbols = DEFAULT_UNIVERSE.filter(
    (u) => !u.symbol.startsWith("^") && !u.symbol.endsWith("=X") && !CORE.some((c) => c.symbol === u.symbol),
  ).map((u) => u.symbol);

  const [stats, markets] = await Promise.all([
    getBolsaAnalysis(symbols).then((r) => r.value.assets),
    o.partePoly > 0 ? getMarkets().then((r) => r.value) : Promise.resolve([]),
  ]);

  const momentum = stats
    .filter((s) => stockSymbols.includes(s.symbol) && s.ret1y !== null && s.ret1m !== null)
    .map((s) => ({ s, mom: (1 + s.ret1y!) / (1 + s.ret1m!) - 1 }))
    .sort((a, b) => b.mom - a.mom)
    .slice(0, o.nMomento);
  const coreOk = CORE.filter((c) => stats.some((s) => s.symbol === c.symbol));

  // Polymarket: só o que termina antes do prazo acabar, para segurar até o resultado (sem pagar spread na saída).
  const deadline = Date.now() + o.holdDays * 86_400_000;
  const polyPicks =
    o.partePoly > 0
      ? pickPoly(
          markets.filter((m) => m.endDate && Date.parse(m.endDate) <= deadline),
          DEFAULT_POLY_SETTINGS,
          2,
        )
      : [];
  const polyCash = polyPicks.length ? Math.floor(cash * o.partePoly) : 0;
  const bolsaCash = cash - polyCash;
  const coreCash = coreOk.length && momentum.length ? bolsaCash / 2 : coreOk.length ? bolsaCash : 0;
  const momCash = bolsaCash - coreCash;
  const cut = (x: number) => Math.floor(x * 100) / 100;

  const orders: NewOrder[] = [
    ...coreOk.map(
      (c): NewOrder => ({ area: "bolsa", ref: c.symbol, label: c.label, sub: c.sub, currency: "BRL", amountBRL: cut(coreCash / coreOk.length), stopPct: null, holdDays: o.holdDays }),
    ),
    ...momentum.map(
      ({ s, mom }): NewOrder => ({
        area: "bolsa",
        ref: s.symbol,
        label: s.display,
        sub: `${s.name} · momento ${mom >= 0 ? "+" : ""}${(mom * 100).toFixed(0)}% em 12 meses`,
        currency: s.symbol.endsWith(".SA") ? "BRL" : "USD",
        amountBRL: cut(momCash / momentum.length),
        stopPct: o.stop,
        holdDays: o.holdDays,
      }),
    ),
    ...polyPicks.map(
      ({ m }): NewOrder => ({
        area: "polymarket",
        ref: m.id,
        label: `${m.outcomes[0] ?? "Sim"} · ${m.question}`,
        sub: m.category,
        currency: "USD",
        amountBRL: cut(polyCash / polyPicks.length),
        stopPct: null,
        holdDays: o.holdDays,
      }),
    ),
  ].filter((x) => x.amountBRL >= 1);
  if (!orders.length) throw new Error("Nenhum ativo passou nos critérios agora");

  await withLock(async () => {
    const c = await load();
    if (!c) throw new Error("Sem carteira");
    for (const ord of orders) placeOrder(c, ord);
    c.events.push({
      t: Date.now(),
      kind: "info",
      text: `Regra nova (núcleo + momento): ${brl(coreCash)} em BOVA11/IVVB11, ${brl(momCash)} em ${momentum.map((m) => m.s.display).join(", ")}${
        polyCash ? ` e ${brl(polyCash)} no Polymarket (só mercados que terminam no prazo)` : ""
      }. Prazo ${o.holdDays} dias${o.stop ? `, stop ${Math.round(o.stop * 100)}% nas ações` : ", sem stop"}.`,
    });
    await save(c);
  });
  return checkNow();
}
