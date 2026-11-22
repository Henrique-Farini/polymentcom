import type { ScoreComponent, ScoreResult, SignalStatus } from "./types";

export interface RawComponent {
  key: string;
  label: string;
  value: number;
  note: string;
}

/** Junta as notas (0–1) com os pesos e devolve score 0–100 e a composição. */
export function compose(raw: RawComponent[], weights: Record<string, number>): {
  score: number;
  components: ScoreComponent[];
} {
  const total = raw.reduce((acc, c) => acc + Math.max(0, weights[c.key] ?? 0), 0) || 1;
  const components = raw.map((c) => {
    const weight = Math.max(0, weights[c.key] ?? 0);
    return { ...c, weight, points: (c.value * weight * 100) / total };
  });
  const score = Math.round(components.reduce((acc, c) => acc + c.points, 0));
  return { score, components };
}

export function finish(
  score: number,
  components: ScoreComponent[],
  alerts: string[],
  minScore: number,
  blockers: string[] = [],
): ScoreResult {
  let status: SignalStatus = "neutro";
  if (alerts.length > 0) status = "alerta";
  else if (score >= minScore && blockers.length === 0) status = "destaque";

  const reasons = [...components]
    .filter((c) => c.value >= 0.6 && c.weight > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, 3)
    .map((c) => c.note);

  return { score, status, components, reasons: blockers.length ? [...blockers, ...reasons] : reasons, alerts };
}
