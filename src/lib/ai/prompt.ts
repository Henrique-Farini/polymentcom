import "server-only";
import type { BolsaAsset, Candle } from "@/lib/bolsa/types";
import type { PolyMarketDetail } from "@/lib/polymarket/types";
import type { ScoreResult } from "@/lib/score/types";

export const SYSTEM_PROMPT = `Você é um analista de mercado que explica sinais técnicos para um investidor pessoa física brasileiro, em português do Brasil, com linguagem simples.

Você recebe os dados de um ativo da bolsa ou de um mercado de previsão do Polymarket, junto com o score calculado pelo sistema (0 a 100) e os alertas. Explique o que os dados mostram. Baseie-se só nos dados recebidos: se algo importante não estiver neles (notícias, balanço, contexto do evento), diga que não está nos dados em vez de supor.

Você não dá ordens de compra ou venda e não diz quanto investir. Seu papel é deixar claro o que favorece, o que pesa contra e o que observar, para a pessoa decidir.

Responda neste formato, em no máximo 250 palavras:

## Cenário
Duas ou três frases sobre o que está acontecendo agora.

## A favor
- até 3 pontos

## Contra
- até 3 pontos

## Riscos
- até 3 pontos (inclua liquidez, prazo ou volatilidade quando pesarem)

## O que observar
- até 3 sinais concretos que mudariam a leitura (ex: "se voltar acima da média de 21 dias", "se a probabilidade passar de 60%")

## Confiança na leitura
Baixa, média ou alta, com uma frase dizendo por quê (qualidade e quantidade dos dados, sinais concordando ou não).`;

const n = (v: number | null | undefined, d = 2) => (v == null || !Number.isFinite(v) ? "n/d" : v.toFixed(d));

function scoreBlock(s: ScoreResult): string {
  const lines = s.components.map((c) => `- ${c.label}: ${c.points.toFixed(0)} pts (nota ${(c.value * 100).toFixed(0)}/100, peso ${c.weight}) — ${c.note}`);
  return [
    `Score do sistema: ${s.score}/100 — classificação: ${s.status}`,
    ...lines,
    s.alerts.length ? `Alertas: ${s.alerts.join("; ")}` : "Alertas: nenhum",
  ].join("\n");
}

/** Reduz uma série a no máximo `max` pontos, mantendo o primeiro e o último. */
function downsample<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr;
  const step = (arr.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => arr[Math.round(i * step)]);
}

const day = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);

export function bolsaContext(a: BolsaAsset, candles: Candle[], s: ScoreResult): string {
  const closes = downsample(candles, 40)
    .map((c) => `${day(c.time)}: ${n(c.close)}`)
    .join(", ");
  return `ATIVO DA BOLSA
Código: ${a.display} (${a.symbol}) — ${a.name} — mercado: ${a.market} — moeda: ${a.currency}
Preço atual: ${n(a.price)} | variação do dia: ${n(a.changePct)}%
Médias móveis (diário): 9d ${n(a.ma9)} | 21d ${n(a.ma21)} | 200d ${n(a.ma200)}
RSI 14: ${n(a.rsi14, 1)} | MACD histograma: ${n(a.macdHist, 3)} (anterior ${n(a.macdHistPrev, 3)})
Bollinger %B: ${n(a.percentB)} | ATR: ${n(a.atrPct, 1)}% do preço
Volume hoje / média 20 dias: ${n(a.volRatio, 2)}x
Faixa de 52 semanas: ${n(a.low52)} a ${n(a.high52)}
Fechamentos dos últimos 6 meses (amostra): ${closes}
Observação: ações da B3 chegam com até 15 min de atraso.

${scoreBlock(s)}`;
}

export function polyContext(d: PolyMarketDetail, s: ScoreResult): string {
  const m = d.market;
  const pts = (v: number | null) => (v == null ? "n/d" : `${(v * 100).toFixed(1)} pontos`);
  const history = downsample(d.history, 40)
    .map((p) => `${new Date(p.t * 1000).toISOString().slice(0, 16).replace("T", " ")}: ${(p.p * 100).toFixed(1)}%`)
    .join(", ");
  const book = d.book
    ? `Melhores compras: ${d.book.bids.slice(0, 5).map((b) => `${(b.price * 100).toFixed(1)}¢ x ${b.size.toFixed(0)}`).join(", ") || "nenhuma"}
Melhores vendas: ${d.book.asks.slice(0, 5).map((b) => `${(b.price * 100).toFixed(1)}¢ x ${b.size.toFixed(0)}`).join(", ") || "nenhuma"}`
    : "Livro de ofertas indisponível";
  return `MERCADO DE PREVISÃO (POLYMARKET)
Pergunta: ${m.question}
Evento: ${m.eventTitle} — categoria: ${m.category}
Resultados e probabilidades: ${m.outcomes.map((o, i) => `${o} ${((m.prices[i] ?? 0) * 100).toFixed(1)}%`).join(" | ")}
Variação da probabilidade de "${m.outcomes[0] ?? "Sim"}": 1h ${pts(m.change1h)} | 24h ${pts(m.change24h)} | 7d ${pts(m.change1w)}
Volume 24h: US$ ${m.volume24h.toFixed(0)} | volume 7d: US$ ${m.volume1w.toFixed(0)} | liquidez: US$ ${m.liquidity.toFixed(0)}
Spread: ${m.spread == null ? "n/d" : `${(m.spread * 100).toFixed(1)} centavos`}
Encerra em: ${m.endDate ?? "sem data"} (agora: ${new Date().toISOString()})
${book}
Histórico da probabilidade (última semana, amostra): ${history || "sem histórico"}

Regras de resolução:
${d.description || "sem descrição"}

${scoreBlock(s)}`;
}
