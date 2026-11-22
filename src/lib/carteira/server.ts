import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getBolsaAnalysis } from "@/lib/analise/bolsa";
import { getAssets, getDividends, type Dividend } from "@/lib/bolsa/server";
import { CORE_ETFS, MOMENTUM_UNIVERSE, displaySymbol } from "@/lib/bolsa/universe";
import { leadOf, pickLongshots, pickRegraNova, topicOf } from "@/lib/picks";
import { getMarketQuote, getMarkets } from "@/lib/polymarket/server";
import { DEFAULT_POLY_SETTINGS } from "@/lib/score/types";
import { allocateWholeShares, applyDividend, applyQuote, areaCash, areaSummary, brl, ensureWallets, closeManual, editCarteira, editPosition, emptyCarteira, placeOrder, recordEquity, type PositionEdit } from "./engine";
import type { Carteira, Position, Quote } from "./types";

/**
 * A carteira fica num arquivo no computador (data/carteira.json) e o servidor confere os preços
 * a cada minuto, mesmo com o navegador fechado, enquanto o `npm run dev` estiver rodando.
 */

const FILE = path.join(process.cwd(), "data", "carteira.json");
const CHECK_EVERY = 60_000;

const g = globalThis as unknown as {
  __carteiraLock?: Promise<unknown>;
  __carteiraTimer?: ReturnType<typeof setInterval>;
  __carteiraCheck?: () => Promise<unknown>;
};

/** Uma alteração por vez no arquivo. */
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = (g.__carteiraLock ?? Promise.resolve()).then(fn, fn);
  g.__carteiraLock = run.catch(() => undefined);
  return run;
}

async function load(): Promise<Carteira | null> {
  try {
    return ensureWallets(JSON.parse(await fs.readFile(FILE, "utf8")) as Carteira);
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

  // Dividendos das ações já compradas (data ex depois da compra).
  const held = [...new Set(live.filter((p) => p.area === "bolsa" && p.status === "aberta").map((p) => p.ref))];
  const divs = new Map<string, Dividend[]>();
  await Promise.all(held.map((s) => getDividends(s).then((d) => divs.set(s, d)).catch(() => undefined)));

  for (const p of live) {
    if (p.area === "bolsa") {
      for (const d of divs.get(p.ref) ?? []) applyDividend(c, p, d, fx, now);
      const q = bq.get(p.ref);
      if (q) applyQuote(c, p, q, fx, now);
    } else {
      const q = pq.get(p.ref);
      if (!q) continue;
      // Compra pelo preço de venda do livro (ask); avalia pelo preço de compra (bid), como seria na vida real.
      // Lado "Não": compra pelo ask do Não (1 − bid do Sim) e avalia pelo bid do Não (1 − ask do Sim).
      const no = p.side === "nao";
      const price = q.resolved ? (no ? 1 - q.price : q.price) : p.status === "pendente" ? (no ? 1 - q.bid : q.ask) : no ? 1 - q.ask : q.bid;
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
  // O cronômetro sobrevive quando o código é recarregado; ele chama sempre a versão mais nova de checkNow.
  g.__carteiraCheck = checkNow;
  if (g.__carteiraTimer) return;
  g.__carteiraTimer = setInterval(() => {
    g.__carteiraCheck?.().catch(() => undefined);
  }, CHECK_EVERY);
}

// Ao carregar (ou recarregar) este arquivo, aponta o cronômetro para o código novo.
g.__carteiraCheck = checkNow;
// Cronômetros criados por versões antigas (antes desta correção) chamam o código velho: troca por um novo.
if (g.__carteiraTimer) {
  clearInterval(g.__carteiraTimer);
  g.__carteiraTimer = undefined;
  startLoop();
}

/* ----------------------------- ações ----------------------------- */

export function novaCarteira(bolsa: number, polymarket: number, days: number | null) {
  return withLock(async () => {
    const c = emptyCarteira(bolsa + polymarket, Date.now(), days, { bolsa, polymarket });
    await save(c);
    return c;
  });
}

export type NewOrder = Pick<Position, "area" | "ref" | "label" | "sub" | "currency" | "amountBRL" | "stopPct" | "holdDays" | "wholeShares" | "side">;

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

export async function editarTeste(e: Parameters<typeof editCarteira>[1]) {
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
  /** Qual caixa investir: cada área tem o próprio dinheiro. */
  area: "bolsa" | "polymarket";
  /** Quantas ações em cada parte (momento e baixa volatilidade). */
  nAcoes: number;
  /** Stop só nas ações (null = sem stop; o backtest mostrou que stop piora). */
  stop: number | null;
  holdDays: number;
  /** Polymarket: com quanto tempo antes do evento apostar (ver LEADS). */
  antecedencia?: string;
}

const CORE_INFO: Record<string, string> = { "BOVA11.SA": "ETF Ibovespa", "IVVB11.SA": "ETF S&P 500 em reais" };

/**
 * Regra adotada (16 anos de teste, revisão mensal): 1/3 no núcleo (BOVA11 + IVVB11),
 * 1/3 nas ações com mais momento 12-1 e 1/3 nas que menos oscilam. Tudo comprável pelo Brasil:
 * ações americanas viram BDR e cripto vira ETF da B3. Só ações inteiras, como na corretora.
 * Polymarket: parte pequena, só mercados que terminam no prazo, segurados até o resultado.
 */
export async function montarAuto(o: AutoOptions) {
  const c0 = await load();
  if (!c0) throw new Error("Crie a carteira primeiro");
  const bolsaCash = o.area === "bolsa" ? areaCash(c0, "bolsa") : 0;
  const polyBudget = o.area === "polymarket" ? areaCash(c0, "polymarket") : 0;

  const [stats, markets] = await Promise.all([
    getBolsaAnalysis([...MOMENTUM_UNIVERSE, ...CORE_ETFS]).then((r) => r.value.assets),
    o.area === "polymarket" ? getMarkets().then((r) => r.value) : Promise.resolve([]),
  ]);
  const { momentum: mom, lowVol, core } = pickRegraNova(stats, MOMENTUM_UNIVERSE, CORE_ETFS, o.nAcoes);

  // Pesos-alvo: 1/3 para cada parte (somando quem aparecer em duas).
  const third = core.length ? 1 / 3 : 1 / 2;
  const weight = new Map<string, number>();
  const why = new Map<string, string[]>();
  const add = (sym: string, w: number, reason: string) => {
    weight.set(sym, (weight.get(sym) ?? 0) + w);
    why.set(sym, [...(why.get(sym) ?? []), reason]);
  };
  core.forEach((s) => add(s.symbol, third / core.length, CORE_INFO[s.symbol] ?? "núcleo"));
  mom.forEach(({ s, mom: m }) => add(s.symbol, third / mom.length, `momento ${m >= 0 ? "+" : ""}${(m * 100).toFixed(0)}% em 12 meses`));
  lowVol.forEach((s) => add(s.symbol, third / lowVol.length, `baixa volatilidade (${(s.vol1y! * 100).toFixed(0)}% ao ano)`));

  // Polymarket: só o que termina antes do prazo acabar.

  // Regra do Polymarket: azarões (5–30%) em mercados que terminam no prazo, muitas apostas pequenas, até o resultado.
  const polyPicks =
    o.area === "polymarket"
      ? pickLongshots(markets, DEFAULT_POLY_SETTINGS, {
          minDays: leadOf(o.antecedencia).minDays,
          maxDays: leadOf(o.antecedencia).maxDays,
          n: 15,
          // Não aposta de novo em assuntos onde já há aposta aberta (mesmo evento ou mesma pergunta com outra data).
          excludeTopics: new Set(
            c0.positions
              .filter((p) => p.area === "polymarket" && p.status !== "fechada")
              .flatMap((p) => {
                const m = markets.find((x) => x.id === p.ref);
                return m ? topicOf(m) : [];
              }),
          ),
        })
      : [];
  // Tamanho de cada aposta: no máximo 2% do patrimônio (¼ de Kelly com a taxa de acerto histórica).
  // O que sobrar do orçamento fica em caixa: azarão exige muitas apostas pequenas, nunca poucas grandes.
  // Cada aposta: até 2% do patrimônio do caixa do Polymarket (¼ de Kelly). O resto fica em caixa.
  const stake = polyPicks.length ? Math.max(5, Math.min(polyBudget / polyPicks.length, 0.02 * areaSummary(c0, "polymarket").patrimonio)) : 0;
  const polyCash = Math.min(polyBudget, stake * polyPicks.length);

  const bySym = new Map(stats.map((s) => [s.symbol, s]));
  const alloc = allocateWholeShares(
    [...weight.entries()].map(([key, w]) => ({ key, price: bySym.get(key)!.price, weight: w })),
    bolsaCash,
  );
  const cut = (x: number) => Math.floor(x * 100) / 100;

  const orders: NewOrder[] = [
    ...alloc.map(
      (a): NewOrder => ({
        area: "bolsa",
        ref: a.key,
        label: displaySymbol(a.key),
        sub: `${bySym.get(a.key)!.name} · ${why.get(a.key)!.join(" e ")}`,
        currency: "BRL",
        amountBRL: cut(a.amount),
        stopPct: CORE_ETFS.includes(a.key) ? null : o.stop,
        holdDays: o.holdDays,
        wholeShares: true,
      }),
    ),
    ...polyPicks.map(
      ({ m, side, price }): NewOrder => ({
        area: "polymarket",
        ref: m.id,
        label: `${side === "sim" ? m.outcomes[0] ?? "Sim" : m.outcomes[1] ?? "Não"} a ${Math.round(price * 100)}¢ · ${m.question}`,
        sub: `${m.category} · azarão, segura até o resultado`,
        currency: "USD",
        amountBRL: cut(stake),
        stopPct: null,
        holdDays: o.holdDays + 7,
        side,
      }),
    ),
  ].filter((x) => x.amountBRL >= 1);
  if (!orders.length) throw new Error("Com esse valor não dá para comprar nenhuma ação inteira dos escolhidos");

  const skipped = bolsaCash > 0 ? [...weight.keys()].filter((k) => !alloc.some((a) => a.key === k)).map(displaySymbol) : [];
  await withLock(async () => {
    const c = await load();
    if (!c) throw new Error("Sem carteira");
    for (const ord of orders) placeOrder(c, ord);
    c.events.push({
      t: Date.now(),
      kind: "info",
      text: [
        alloc.length
          ? `Bolsa (núcleo + momento + baixa volatilidade): ${alloc.length} ordens de ações inteiras somando ${brl(alloc.reduce((s, a) => s + a.amount, 0))}, prazo ${o.holdDays} dias${o.stop ? `, stop ${Math.round(o.stop * 100)}%` : ", sem stop"}.`
          : "",
        polyCash
          ? `Polymarket (azarões, ${leadOf(o.antecedencia).label.replace(" (melhor no teste)", "")} do evento): ${polyPicks.length} apostas de ${brl(stake)} (até 2% do patrimônio cada), somando ${brl(polyCash)}, seguradas até o resultado.`
          : o.area === "polymarket"
            ? "Polymarket: nenhum azarão novo dentro da regra agora."
            : "",
        skipped.length ? `Ficaram de fora por não caber nem 1 ação: ${skipped.join(", ")}.` : "",
      ]
        .filter(Boolean)
        .join(" "),
    });
    await save(c);
  });
  return checkNow();
}
