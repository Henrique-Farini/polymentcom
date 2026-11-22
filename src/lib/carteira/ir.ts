import type { Carteira, Position } from "./types";

/**
 * Imposto de renda estimado sobre as operações encerradas (regras simplificadas para pessoa física):
 * - Ações (inclui units como KLBN11, TAEE11): 15% sobre o lucro do mês; isento se as vendas de
 *   ações no mês somarem até R$ 20 mil.
 * - ETFs (BOVA11, IVVB11, QBTC11…) e BDRs: 15% sobre o lucro do mês, sem isenção.
 * - Day trade (comprou e vendeu no mesmo dia): 20%.
 * - Polymarket: ganho no exterior, 15% na declaração anual (Lei 14.754/2023).
 * - Prejuízo do mês abate lucro do mesmo tipo no mês. Dividendos: isentos.
 * É uma estimativa para comparar estratégias, não substitui o cálculo oficial (DARF).
 */

export type TaxClass = "acoes" | "etf_bdr" | "daytrade" | "exterior";

export const TAX_LABEL: Record<TaxClass, string> = {
  acoes: "Ações (isenção até R$ 20 mil de vendas no mês)",
  etf_bdr: "ETFs e BDRs (15%, sem isenção)",
  daytrade: "Day trade (20%)",
  exterior: "Polymarket, ganho no exterior (15% na declaração anual)",
};

const ETFS = new Set(["BOVA11.SA", "IVVB11.SA", "QBTC11.SA", "QETH11.SA", "HASH11.SA", "SMAL11.SA"]);

export function taxClassOf(p: Position): TaxClass {
  if (p.area === "polymarket") return "exterior";
  if (p.filledAt && p.closedAt && new Date(p.filledAt).toDateString() === new Date(p.closedAt).toDateString()) return "daytrade";
  if (ETFS.has(p.ref) || /3[2-9]\.SA$/.test(p.ref)) return "etf_bdr";
  return "acoes";
}

export interface TaxLine {
  month: string;
  cls: TaxClass;
  sales: number;
  gain: number;
  tax: number;
  note: string;
}

export function estimateTax(c: Carteira): { lines: TaxLine[]; total: number; gross: number } {
  const groups = new Map<string, { cls: TaxClass; month: string; sales: number; gain: number }>();
  for (const p of c.positions) {
    if (p.status !== "fechada" || !p.closedAt || !p.qty || p.exitPrice === undefined) continue;
    const cls = taxClassOf(p);
    const month = new Date(p.closedAt).toISOString().slice(0, 7);
    const fx = p.currency === "USD" ? p.fxLast ?? p.fxEntry ?? 1 : 1;
    const sales = p.qty * p.exitPrice * fx;
    // Dividendos são isentos: o ganho tributável é só a diferença de preço.
    const gain = (p.pnlBRL ?? 0) - (p.divBRL ?? 0);
    const k = `${month}|${cls}`;
    const g = groups.get(k) ?? { cls, month, sales: 0, gain: 0 };
    g.sales += sales;
    g.gain += gain;
    groups.set(k, g);
  }
  const lines: TaxLine[] = [...groups.values()].map((g) => {
    let tax = 0;
    let note = "";
    if (g.gain <= 0) note = "Prejuízo: sem imposto (pode abater lucros futuros)";
    else if (g.cls === "acoes" && g.sales <= 20_000) note = "Isento: vendas de ações no mês até R$ 20 mil";
    else {
      tax = g.gain * (g.cls === "daytrade" ? 0.2 : 0.15);
      note = g.cls === "exterior" ? "Pago na declaração anual" : "Pago por DARF até o fim do mês seguinte";
    }
    return { ...g, tax, note };
  });
  lines.sort((a, b) => a.month.localeCompare(b.month));
  const gross = c.positions.filter((p) => p.status === "fechada").reduce((s, p) => s + (p.pnlBRL ?? 0), 0);
  return { lines, total: lines.reduce((s, l) => s + l.tax, 0), gross };
}
