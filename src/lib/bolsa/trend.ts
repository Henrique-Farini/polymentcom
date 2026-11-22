import type { BolsaAsset } from "./types";

export type Trend = "alta-forte" | "alta" | "lateral" | "baixa" | "baixa-forte";

export const TREND_META: Record<Trend, { label: string; icon: string; cls: string; rank: number }> = {
  "alta-forte": { label: "Alta forte", icon: "▲▲", cls: "bg-up/20 text-up ring-up/40", rank: 2 },
  alta: { label: "Alta", icon: "▲", cls: "bg-up/10 text-up ring-up/20", rank: 1 },
  lateral: { label: "Lateral", icon: "◆", cls: "bg-card2 text-muted ring-line", rank: 0 },
  baixa: { label: "Baixa", icon: "▼", cls: "bg-down/10 text-down ring-down/20", rank: -1 },
  "baixa-forte": { label: "Baixa forte", icon: "▼▼", cls: "bg-down/20 text-down ring-down/40", rank: -2 },
};

/** Tendência pelo alinhamento do preço com as médias de 9, 21 e 200 dias. */
export function trendOf(a: Pick<BolsaAsset, "price" | "ma9" | "ma21" | "ma200">): Trend {
  const { price, ma9, ma21, ma200 } = a;
  if (ma21 === null) return "lateral";
  const longUp = ma200 === null || ma21 > ma200;
  const shortUp = ma9 !== null && ma9 > ma21;
  if (price > ma21 && shortUp && longUp && (ma200 === null || price > ma200)) return "alta-forte";
  if (price < ma21 && !shortUp && !longUp && ma200 !== null && price < ma200) return "baixa-forte";
  const gap = (price - ma21) / ma21;
  if (Math.abs(gap) < 0.005) return "lateral";
  return gap > 0 ? "alta" : "baixa";
}
