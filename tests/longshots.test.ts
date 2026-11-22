import { describe, expect, it } from "vitest";
import { leadOf, pickLongshots, topicOf } from "@/lib/picks";
import type { PolyMarket } from "@/lib/polymarket/types";
import { DEFAULT_POLY_SETTINGS } from "@/lib/score/types";

const NOW = Date.UTC(2026, 10, 21);
const mk = (id: string, p: number, days: number, extra: Partial<PolyMarket> = {}): PolyMarket => ({
  id, title: id, question: id, eventTitle: id, eventSlug: id, slug: id, category: "Esportes", image: null,
  outcomes: ["Sim", "Não"], prices: [p, 1 - p], probability: p, change1h: 0, change24h: 0, change1w: 0,
  volume24h: 1e5, volume1w: 1e6, liquidity: 50_000, spread: 0.01, bestBid: p - 0.005, bestAsk: p + 0.005,
  endDate: new Date(NOW + days * 86_400_000).toISOString(), tokenIds: [], ...extra,
});

describe("pickLongshots", () => {
  it("escolhe o lado azarão (Sim barato ou Não barato) dentro do prazo", () => {
    const r = pickLongshots([mk("a", 0.2, 5), mk("b", 0.85, 4), mk("c", 0.5, 5), mk("d", 0.2, 20)], DEFAULT_POLY_SETTINGS, { minDays: 2, maxDays: 9, now: NOW });
    expect(r.map((x) => `${x.m.id}:${x.side}`)).toEqual(["a:sim", "b:nao"]);
    expect(r[1].price).toBeCloseTo(0.155);
  });

  it("ignora spread largo e liquidez baixa", () => {
    const r = pickLongshots([mk("a", 0.2, 5, { spread: 0.08 }), mk("b", 0.2, 5, { liquidity: 100 })], DEFAULT_POLY_SETTINGS, { minDays: 2, maxDays: 9, now: NOW });
    expect(r).toEqual([]);
  });
});

describe("um assunto por aposta", () => {
  it("não aposta duas vezes no mesmo evento nem na mesma pergunta com outra data", () => {
    const a = mk("a", 0.2, 5, { eventSlug: "next-pm-spain", question: "Will Pedro Sánchez be the next Prime Minister of Spain?", liquidity: 90_000 });
    const b = mk("b", 0.88, 5, { eventSlug: "next-pm-spain", question: "Will Alberto Núñez Feijóo be the next Prime Minister of Spain?" });
    const c = mk("c", 0.95, 3, { eventSlug: "btc-24", question: "Will the price of Bitcoin be above $54,000 on November 24?", liquidity: 80_000 });
    const d = mk("d", 0.93, 4, { eventSlug: "btc-25", question: "Will the price of Bitcoin be above $54,000 on November 25?" });
    const r = pickLongshots([a, b, c, d], DEFAULT_POLY_SETTINGS, { minDays: 2, maxDays: 9, now: NOW });
    expect(r.map((x) => x.m.id).sort()).toEqual(["a", "c"]);
  });

  it("pula assuntos em que já existe aposta", () => {
    const a = mk("a", 0.2, 5, { eventSlug: "taiwan" });
    const r = pickLongshots([a], DEFAULT_POLY_SETTINGS, { minDays: 2, maxDays: 9, now: NOW, excludeTopics: new Set(["taiwan"]) });
    expect(r).toEqual([]);
  });
});

describe("jogos e mercados decididos", () => {
  it("não aposta em jogo que já começou ou começa em menos de 2 dias, mesmo com o fim do mercado longe", () => {
    const live = mk("tenis", 0.28, 7, { gameStart: new Date(NOW - 3_600_000).toISOString() });
    const soon = mk("jogo", 0.2, 7, { gameStart: new Date(NOW + 86_400_000).toISOString() });
    const later = mk("depois", 0.2, 7, { gameStart: new Date(NOW + 4 * 86_400_000).toISOString() });
    const r = pickLongshots([live, soon, later], DEFAULT_POLY_SETTINGS, { minDays: 2, maxDays: 9, now: NOW });
    expect(r.map((x) => x.m.id)).toEqual(["depois"]);
  });

  it("ignora mercado com resultado já proposto", () => {
    expect(pickLongshots([mk("a", 0.2, 5, { settling: true })], DEFAULT_POLY_SETTINGS, { minDays: 2, maxDays: 9, now: NOW })).toEqual([]);
  });
});

describe("antecedência escolhida", () => {
  it("aposta minutos antes do jogo começar, mas nunca depois", () => {
    const em20min = mk("em20", 0.2, 7, { gameStart: new Date(NOW + 20 * 60_000).toISOString() });
    const jaComecou = mk("ja", 0.2, 7, { gameStart: new Date(NOW - 60_000).toISOString() });
    const em3h = mk("em3h", 0.2, 7, { gameStart: new Date(NOW + 3 * 3_600_000).toISOString() });
    const minutos = leadOf("minutos");
    const r = pickLongshots([em20min, jaComecou, em3h], DEFAULT_POLY_SETTINGS, { ...minutos, now: NOW });
    expect(r.map((x) => x.m.id)).toEqual(["em20"]);
    const horas = leadOf("horas");
    expect(pickLongshots([em20min, jaComecou, em3h], DEFAULT_POLY_SETTINGS, { ...horas, now: NOW }).map((x) => x.m.id)).toEqual(["em3h"]);
  });
});

describe("mesmo ativo", () => {
  it("apostas sobre o preço do Bitcoin contam como um assunto só", () => {
    const a = mk("a", 0.09, 1.5, { eventSlug: "btc-64k", question: "Will Bitcoin reach $64,000 November 16-22?", liquidity: 90_000 });
    const b = mk("b", 0.94, 1.8, { eventSlug: "btc-56k", question: "Will the price of Bitcoin be above $56,000 on November 23?" });
    const c = mk("c", 0.05, 1.3, { eventSlug: "eth", question: "Will Ethereum dip to $1,500 November 16-22?" });
    const r = pickLongshots([a, b, c], DEFAULT_POLY_SETTINGS, { minDays: 0.01, maxDays: 9, now: NOW });
    expect(r.map((x) => x.m.id).sort()).toEqual(["a", "c"]);
    expect(topicOf(a)).toContain("preco:bitcoin");
  });
});
