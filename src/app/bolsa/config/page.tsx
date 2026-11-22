"use client";

import { useState } from "react";
import { AlertSettings } from "@/components/AlertSettings";
import { Card } from "@/components/ui";
import { NumberSetting, WeightsEditor } from "@/components/WeightsEditor";
import { DEFAULT_UNIVERSE, displaySymbol, normalizeSymbol } from "@/lib/bolsa/universe";
import { useStored } from "@/lib/client/hooks";
import { useBolsaSettings, useBolsaUniverse } from "@/lib/client/settings";
import { DEFAULT_ALERT_PREFS, type AlertPrefs } from "@/lib/client/transitions";
import { DEFAULT_BOLSA_SETTINGS } from "@/lib/score/types";

const FIELDS = [
  { key: "tendencia", label: "Tendência", hint: "Preço acima das médias de 9, 21 e 200 dias, e médias alinhadas." },
  { key: "momento", label: "Momento", hint: "RSI em zona saudável (55–70) e MACD positivo/subindo." },
  { key: "volume", label: "Volume", hint: "Volume acima da média confirmando alta (ou pesando na queda)." },
  { key: "volatilidade", label: "Volatilidade", hint: "Posição nas Bandas de Bollinger; ATR alto tira pontos." },
  { key: "dia", label: "Variação do dia", hint: "Quanto subiu ou caiu hoje." },
];

export default function BolsaConfigPage() {
  const [s, setS] = useBolsaSettings();
  const [universe, setUniverse] = useBolsaUniverse();
  const [alerts, setAlerts] = useStored<AlertPrefs>("radar:bolsa:alerts", DEFAULT_ALERT_PREFS, true);
  const [input, setInput] = useState("");

  function add() {
    const symbols = input.split(/[\s,;]+/).map(normalizeSymbol).filter((x) => /^[A-Z0-9.^=\-]{1,15}$/.test(x));
    if (symbols.length) setUniverse((u) => [...u, ...symbols.filter((x) => !u.includes(x))].slice(0, 60));
    setInput("");
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">
          <span className="text-up">▲</span> Bolsa · Configurações
        </h1>
        <button type="button" onClick={() => setS(DEFAULT_BOLSA_SETTINGS)} className="rounded-md bg-card2 px-3 py-1.5 text-xs text-muted hover:text-text">
          Restaurar padrão
        </button>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <WeightsEditor fields={FIELDS} weights={s.weights} onChange={(w) => setS({ ...s, weights: w as typeof s.weights })} />
          <Card className="space-y-4 p-4">
            <h2 className="text-sm font-semibold">Limites</h2>
            <NumberSetting label="Score mínimo para “Em destaque”" hint="Abaixo disso o ativo fica neutro." value={s.minScore} min={40} max={95} onChange={(v) => setS({ ...s, minScore: v })} />
            <NumberSetting label="Alerta se cair no dia mais de" hint="Queda do dia que coloca o ativo em alerta." value={s.dropPct} min={1} max={15} step={0.5} suffix="%" onChange={(v) => setS({ ...s, dropPct: v })} />
            <NumberSetting label="Alerta se o score ficar abaixo de" hint="Sinais técnicos muito fracos." value={s.alertScore} min={0} max={50} onChange={(v) => setS({ ...s, alertScore: v })} />
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Ativos acompanhados ({universe.length})</h2>
              <button type="button" onClick={() => setUniverse(DEFAULT_UNIVERSE.map((u) => u.symbol))} className="text-xs text-muted hover:text-text">
                Restaurar lista
              </button>
            </div>
            <p className="mt-1 text-xs text-muted">
              Digite códigos separados por vírgula: <span className="num">PETR4, TAEE11, AAPL, BTC</span>. Ações da B3 ganham “.SA” sozinhas.
            </p>
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                add();
              }}
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Adicionar ativos…"
                className="flex-1 rounded-md border border-line bg-bg px-2.5 py-1.5 text-sm outline-none focus:border-up"
              />
              <button type="submit" className="rounded-md bg-up px-3 py-1.5 text-sm font-medium text-black">
                Adicionar
              </button>
            </form>
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {universe.map((sym) => (
                <li key={sym} className="flex items-center gap-1 rounded-full bg-card2 py-0.5 pr-1 pl-2.5 text-xs">
                  <span className="num">{displaySymbol(sym)}</span>
                  <button
                    type="button"
                    onClick={() => setUniverse((u) => u.filter((x) => x !== sym))}
                    aria-label={`Remover ${sym}`}
                    className="rounded-full px-1 text-muted hover:text-down"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </Card>
          <AlertSettings prefs={alerts} setPrefs={setAlerts} />
        </div>
      </div>
    </div>
  );
}
