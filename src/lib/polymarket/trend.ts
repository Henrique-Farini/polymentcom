import type { Trend } from "@/lib/bolsa/trend";
import type { PolyMarket } from "./types";

/** Tendência da probabilidade pelo movimento em 24h, confirmado pela semana. Pontos: 0.05 = 5 pontos. */
export function polyTrend(m: Pick<PolyMarket, "change24h" | "change1w">): Trend {
  const d = m.change24h ?? 0;
  const w = m.change1w ?? 0;
  if (d >= 0.05 && w >= 0) return "alta-forte";
  if (d <= -0.05 && w <= 0) return "baixa-forte";
  if (d >= 0.01) return "alta";
  if (d <= -0.01) return "baixa";
  return "lateral";
}
