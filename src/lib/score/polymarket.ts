import type { PolyMarket } from "@/lib/polymarket/types";
import { clamp01 } from "@/lib/indicators";
import { compose, finish, type RawComponent } from "./compose";
import type { PolySettings, ScoreResult } from "./types";

const pts = (n: number) => `${n >= 0 ? "+" : ""}${(n * 100).toFixed(1)} pts`;
const money = (n: number) =>
  n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(0)}K` : `$${n.toFixed(0)}`;

export function hoursToEnd(m: PolyMarket, now = Date.now()): number | null {
  if (!m.endDate) return null;
  const t = Date.parse(m.endDate);
  return Number.isFinite(t) ? (t - now) / 3_600_000 : null;
}

export function scorePoly(m: PolyMarket, s: PolySettings, now = Date.now()): ScoreResult {
  const raw: RawComponent[] = [];

  // Momento: probabilidade subindo em 24h e na semana.
  {
    const c24 = m.change24h ?? 0;
    const c1w = m.change1w ?? 0;
    const f = (x: number) => clamp01((x * 100 + 3) / 13); // -3 pts → 0, +10 pts → 1
    const v = 0.7 * f(c24) + 0.3 * f(c1w / 2);
    raw.push({ key: "momento", label: "Momento", value: v, note: `Probabilidade ${pts(c24)} em 24h, ${pts(c1w)} na semana` });
  }

  // Volume: tamanho absoluto e se está acima da média diária da semana.
  {
    const avgDay = m.volume1w > 0 ? m.volume1w / 7 : 0;
    const surge = avgDay > 0 ? m.volume24h / avgDay : 1;
    const absScore = clamp01(Math.log10(m.volume24h + 1) / 6); // $1M/dia → 1
    const surgeScore = clamp01((surge - 0.5) / 2);
    const v = 0.5 * absScore + 0.5 * surgeScore;
    const note =
      surge >= 1.5 ? `Volume 24h ${money(m.volume24h)} (${surge.toFixed(1)}x a média)` : `Volume 24h ${money(m.volume24h)}`;
    raw.push({ key: "volume", label: "Volume", value: v, note });
  }

  // Liquidez: mais dinheiro no livro = preço mais confiável.
  raw.push({
    key: "liquidez",
    label: "Liquidez",
    value: clamp01((Math.log10(m.liquidity + 1) - 3) / 3), // $1K → 0, $1M → 1
    note: `Liquidez ${money(m.liquidity)}`,
  });

  // Spread: diferença entre compra e venda.
  {
    const sp = m.spread;
    const v = sp === null ? 0.5 : clamp01(1 - (sp - 0.01) / 0.04);
    raw.push({ key: "spread", label: "Spread", value: v, note: sp === null ? "Spread indisponível" : `Spread ${(sp * 100).toFixed(1)} pts` });
  }

  // Tempo até encerrar: muito perto ou muito longe tira pontos.
  {
    const h = hoursToEnd(m, now);
    let v = 0.6;
    let note = "Sem data de encerramento";
    if (h !== null) {
      v = h < 2 ? 0.2 : h < 24 ? 0.6 : h <= 24 * 60 ? 1 : h <= 24 * 180 ? 0.7 : 0.45;
      note = h < 24 ? `Encerra em ${Math.max(0, h).toFixed(0)}h` : `Encerra em ${(h / 24).toFixed(0)} dias`;
    }
    raw.push({ key: "tempo", label: "Tempo", value: v, note });
  }

  const { score, components } = compose(raw, s.weights);

  const alerts: string[] = [];
  if (m.change24h !== null && m.change24h * 100 <= -Math.abs(s.dropPts24h))
    alerts.push(`Probabilidade despencou ${pts(m.change24h)} em 24h`);
  if (m.change1h !== null && m.change1h * 100 <= -Math.abs(s.dropPts1h))
    alerts.push(`Caiu ${pts(m.change1h)} na última hora`);
  if (m.liquidity < s.minLiquidity) alerts.push(`Liquidez muito baixa (${money(m.liquidity)}): sinal pouco confiável`);
  if (m.spread !== null && m.spread * 100 > s.maxSpreadPts)
    alerts.push(`Spread largo (${(m.spread * 100).toFixed(1)} pts)`);

  // Quase decidido: pouco a ganhar, não entra em destaque.
  const blockers: string[] = [];
  if (m.probability <= 0.03 || m.probability >= 0.97) blockers.push("Quase decidido: pouco espaço para variar");

  return finish(score, components, alerts, s.minScore, blockers);
}
