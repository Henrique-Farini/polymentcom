/** Perfil de risco e nível de risco. Sem dependência de navegador: usado no servidor e na tela. */

export type Perfil = "conservador" | "moderado" | "arrojado";

export const PERFIL_META: Record<Perfil, { label: string; desc: string; maxVol: number; color: string }> = {
  conservador: {
    label: "Conservador",
    desc: "Prefere não perder a ganhar muito. Mostramos só ativos que oscilam pouco.",
    maxVol: 0.25,
    color: "text-sky-400",
  },
  moderado: {
    label: "Moderado",
    desc: "Aceita algum sobe e desce em troca de ganhar mais. Ativos de risco baixo a médio.",
    maxVol: 0.4,
    color: "text-warn",
  },
  arrojado: {
    label: "Arrojado",
    desc: "Aceita quedas fortes no caminho buscando ganhos maiores. Todos os ativos entram.",
    maxVol: Infinity,
    color: "text-down",
  },
};

export type RiskLevel = "Baixo" | "Médio" | "Alto" | "Muito alto";

/** Nível de risco a partir da volatilidade anual. */
export function riskLevel(vol: number | null): RiskLevel | null {
  if (vol === null) return null;
  if (vol < 0.2) return "Baixo";
  if (vol < 0.35) return "Médio";
  if (vol < 0.6) return "Alto";
  return "Muito alto";
}

export const RISK_STYLE: Record<RiskLevel, string> = {
  Baixo: "bg-up/15 text-up ring-up/30",
  Médio: "bg-warn/15 text-warn ring-warn/30",
  Alto: "bg-down/15 text-down ring-down/30",
  "Muito alto": "bg-down/25 text-down ring-down/50",
};
