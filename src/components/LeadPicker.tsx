"use client";

import { usePolling } from "@/lib/client/hooks";
import { LEADS, leadOf } from "@/lib/picks";
import type { PolyBacktest } from "@/lib/polymarket/backtest";

const pc = (x: number) => `${x > 0 ? "+" : ""}${(x * 100).toFixed(0)}%`;
const H_LABEL: Record<number, string> = { 168: "7 dias antes", 72: "3 dias antes", 24: "1 dia antes", 6: "6 horas antes" };

/**
 * Escolha de com quanto tempo antes do evento apostar, mostrando o que a regra do azarão
 * rendeu no teste com mercados resolvidos nesse prazo.
 */
export function LeadPicker({ value, onChange, className = "" }: { value: string; onChange: (k: string) => void; className?: string }) {
  const bt = usePolling<PolyBacktest>("/api/polymarket/estrategias", 6 * 60 * 60_000);
  const lead = leadOf(value);
  const azarao = bt.data?.rules.find((r) => r.key === "azarao");
  const stats = azarao?.stats.filter((s) => (lead.h ? s.h === lead.h : true)) ?? [];

  return (
    <div className={className}>
      <label className="block text-sm">
        <span className="mb-1 block text-xs text-muted">Quando apostar (antes do jogo começar ou do evento acontecer)</span>
        <select
          className="rounded-lg border border-line bg-card2 px-2.5 py-1.5 text-sm outline-none focus:border-info"
          value={lead.key}
          onChange={(e) => onChange(e.target.value)}
        >
          {LEADS.map((l) => (
            <option key={l.key} value={l.key}>
              {l.label}
            </option>
          ))}
        </select>
      </label>
      <p className="mt-1 text-[11px] text-muted">
        {!azarao
          ? "Carregando o histórico…"
          : stats.map((s, i) => (
              <span key={s.h}>
                {i > 0 && " · "}
                No teste, azarão {H_LABEL[s.h]}:{" "}
                <b className={s.ciLow > 0 ? "text-up" : s.roi > 0 ? "text-warn" : "text-down"}>{pc(s.roi)} por aposta</b> (margem {pc(s.ciLow)} a {pc(s.ciHigh)}, {s.n} mercados)
              </span>
            ))}
        {azarao && lead.h !== 168 && " · Quanto mais perto do evento, menor a vantagem que apareceu no teste."}
        {" Nunca aposta com o jogo já começado."}
      </p>
    </div>
  );
}
