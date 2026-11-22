/** Seleção dos "mais fortes agora" por perfil. Pura: usada na tela de iniciantes e na carteira de teste. */
import type { AssetStats } from "@/lib/analise/types";
import type { BolsaAsset } from "@/lib/bolsa/types";
import { PERFIL_META, type Perfil } from "@/lib/perfil";
import type { PolyMarket } from "@/lib/polymarket/types";
import { scoreBolsa } from "@/lib/score/bolsa";
import { scorePoly } from "@/lib/score/polymarket";
import type { BolsaSettings, PolySettings, ScoreResult } from "@/lib/score/types";

export interface BolsaPick {
  a: BolsaAsset;
  s: ScoreResult;
  st: AssetStats | null;
}

export function pickBolsa(
  assets: BolsaAsset[],
  stats: AssetStats[] | null,
  perfil: Perfil,
  settings: BolsaSettings,
  opts: { n?: number; investableOnly?: boolean } = {},
) {
  const byStat = new Map(stats?.map((x) => [x.symbol, x]) ?? []);
  const maxVol = PERFIL_META[perfil].maxVol;
  const all: BolsaPick[] = assets.map((a) => ({ a, s: scoreBolsa(a, settings), st: byStat.get(a.symbol) ?? null }));
  // Sem a análise carregada, usa o ATR diário (%) como aproximação da volatilidade anual.
  const fits = (p: BolsaPick) =>
    maxVol === Infinity || (p.st ? (p.st.vol1y ?? 0) <= maxVol : ((p.a.atrPct ?? 0) * Math.sqrt(252)) / 100 <= maxVol);
  // Índices e câmbio não se compram diretamente na corretora (seria via ETF).
  const investable = (p: BolsaPick) => !opts.investableOnly || (!p.a.symbol.startsWith("^") && !p.a.symbol.endsWith("=X"));
  const rr = (p: BolsaPick) => Math.max(-1, Math.min(2, p.st?.retRisk1y ?? 0));
  const best = all
    .filter((p) => p.s.status !== "alerta" && fits(p) && investable(p))
    .sort(
      (x, y) =>
        (y.s.status === "destaque" ? 1 : 0) - (x.s.status === "destaque" ? 1 : 0) ||
        y.s.score / 100 + rr(y) / 2 - (x.s.score / 100 + rr(x) / 2),
    )
    .slice(0, opts.n ?? 4);
  const avoid = all.filter((p) => p.s.status === "alerta").sort((x, y) => x.a.changePct - y.a.changePct).slice(0, 4);
  return { best, avoid, all };
}

/** Mercados com chance entre 15% e 85%, liquidez boa e score alto. */
export function pickPoly(markets: PolyMarket[], settings: PolySettings, n = 4, now = Date.now()) {
  return markets
    .filter((m) => m.probability >= 0.15 && m.probability <= 0.85 && m.liquidity >= settings.minLiquidity)
    .map((m) => ({ m, s: scorePoly(m, settings, now) }))
    .filter((x) => x.s.status !== "alerta")
    .sort((a, b) => (b.s.status === "destaque" ? 1 : 0) - (a.s.status === "destaque" ? 1 : 0) || b.s.score - a.s.score)
    .slice(0, n);
}

/**
 * Regra nova (testada em 16 anos): 1/3 núcleo (BOVA11 + IVVB11), 1/3 nas `n` com mais momento 12-1,
 * 1/3 nas `n` que menos oscilam. Recebe as estatísticas da análise (preços com dividendos).
 */
export function pickRegraNova(stats: AssetStats[], universe: string[], core: string[], n = 4) {
  const stocks = stats.filter((s) => universe.includes(s.symbol) && s.ret1y !== null && s.ret1m !== null && s.vol1y !== null);
  const momentum = stocks
    .map((s) => ({ s, mom: (1 + s.ret1y!) / (1 + s.ret1m!) - 1 }))
    .sort((a, b) => b.mom - a.mom)
    .slice(0, n);
  const lowVol = [...stocks].sort((a, b) => a.vol1y! - b.vol1y!).slice(0, n);
  const coreStats = stats.filter((s) => core.includes(s.symbol));
  return { core: coreStats, momentum, lowVol };
}

export interface LongshotPick {
  m: PolyMarket;
  side: "sim" | "nao";
  /** Preço para comprar o lado escolhido (ask). */
  price: number;
  days: number;
}

/**
 * Regra do Polymarket (melhor resultado no teste com ~1.100 mercados resolvidos): comprar o lado
 * azarão (custa 5–30%) cerca de uma semana antes do fim e segurar até o resultado.
 * Perde ~3 de cada 4 vezes: só faz sentido com muitas apostas pequenas.
 */
/**
 * Assunto de um mercado: mercados do mesmo evento ("quem será o premiê") ou da mesma pergunta com outra
 * data/valor ("Bitcoin acima de X no dia 24" e "no dia 25") ganham ou perdem juntos.
 * Apostar em dois deles não diversifica: é dobrar a mesma aposta.
 */
export function topicOf(m: Pick<PolyMarket, "eventSlug" | "question">) {
  const q = m.question
    .toLowerCase()
    .replace(/(january|february|march|april|may|june|july|august|september|october|november|december)/g, "")
    .replace(/[0-9$,.%]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return [m.eventSlug || q, q];
}

export function pickLongshots(
  markets: PolyMarket[],
  settings: PolySettings,
  opts: { minDays: number; maxDays: number; n?: number; now?: number; excludeTopics?: Set<string> },
) {
  const now = opts.now ?? Date.now();
  const out: LongshotPick[] = [];
  for (const m of markets) {
    if (!m.endDate || m.liquidity < settings.minLiquidity || m.settling) continue;
    // Jogos: se já começou (ou começa logo), não é a aposta testada; seria apostar com o jogo rolando.
    if (m.gameStart && (Date.parse(m.gameStart) - now) / 86_400_000 < opts.minDays) continue;
    const days = (Date.parse(m.endDate) - now) / 86_400_000;
    if (!(days >= opts.minDays && days <= opts.maxDays)) continue;
    if (m.spread !== null && m.spread > 0.04) continue;
    const askYes = m.bestAsk ?? m.probability;
    const askNo = 1 - (m.bestBid ?? m.probability);
    if (askYes >= 0.05 && askYes < 0.3) out.push({ m, side: "sim", price: askYes, days });
    else if (askNo >= 0.05 && askNo < 0.3) out.push({ m, side: "nao", price: askNo, days });
  }
  // No máximo uma aposta por assunto (o mais líquido), e nenhuma em assunto onde já existe aposta.
  const used = new Set(opts.excludeTopics ?? []);
  const picked: LongshotPick[] = [];
  for (const x of out.sort((a, b) => b.m.liquidity - a.m.liquidity)) {
    const keys = topicOf(x.m);
    if (keys.some((k) => used.has(k))) continue;
    keys.forEach((k) => used.add(k));
    picked.push(x);
    if (picked.length >= (opts.n ?? 20)) break;
  }
  return picked;
}
