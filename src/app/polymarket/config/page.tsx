"use client";

import { AlertSettings } from "@/components/AlertSettings";
import { Card } from "@/components/ui";
import { NumberSetting, WeightsEditor } from "@/components/WeightsEditor";
import { useStored } from "@/lib/client/hooks";
import { usePolySettings } from "@/lib/client/settings";
import { DEFAULT_ALERT_PREFS, type AlertPrefs } from "@/lib/client/transitions";
import { DEFAULT_POLY_SETTINGS } from "@/lib/score/types";

const FIELDS = [
  { key: "momento", label: "Momento", hint: "Probabilidade subindo em 24h e na semana." },
  { key: "volume", label: "Volume", hint: "Dinheiro negociado em 24h e se está acima da média da semana." },
  { key: "liquidez", label: "Liquidez", hint: "Quanto dinheiro há no livro. Mais liquidez = preço mais confiável." },
  { key: "spread", label: "Spread", hint: "Diferença entre o melhor preço de compra e de venda. Menor é melhor." },
  { key: "tempo", label: "Tempo até encerrar", hint: "Prefere mercados que encerram entre 1 e 60 dias." },
];

export default function PolyConfigPage() {
  const [s, setS] = usePolySettings();
  const [alerts, setAlerts] = useStored<AlertPrefs>("radar:polymarket:alerts", DEFAULT_ALERT_PREFS, true);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">
          <span className="text-poly">◆</span> Polymarket · Configurações
        </h1>
        <button type="button" onClick={() => setS(DEFAULT_POLY_SETTINGS)} className="rounded-md bg-card2 px-3 py-1.5 text-xs text-muted hover:text-text">
          Restaurar padrão
        </button>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <WeightsEditor fields={FIELDS} weights={s.weights} onChange={(w) => setS({ ...s, weights: w as typeof s.weights })} />

        <div className="space-y-4">
          <Card className="space-y-4 p-4">
            <h2 className="text-sm font-semibold">Limites</h2>
            <NumberSetting
              label="Score mínimo para “Em destaque”"
              hint="Abaixo disso o mercado fica neutro."
              value={s.minScore}
              min={40}
              max={95}
              onChange={(v) => setS({ ...s, minScore: v })}
            />
            <NumberSetting
              label="Alerta se cair em 24h mais de"
              hint="Em pontos de probabilidade (ex: de 60% para 48% = 12 pontos)."
              value={s.dropPts24h}
              min={2}
              max={40}
              suffix=" pts"
              onChange={(v) => setS({ ...s, dropPts24h: v })}
            />
            <NumberSetting
              label="Alerta se cair em 1h mais de"
              hint="Queda brusca de curto prazo."
              value={s.dropPts1h}
              min={1}
              max={25}
              suffix=" pts"
              onChange={(v) => setS({ ...s, dropPts1h: v })}
            />
            <NumberSetting
              label="Liquidez mínima"
              hint="Abaixo disso o mercado vai para alerta: o preço pode não refletir a realidade."
              value={s.minLiquidity}
              min={0}
              max={100_000}
              step={1_000}
              suffix=" US$"
              onChange={(v) => setS({ ...s, minLiquidity: v })}
            />
            <NumberSetting
              label="Spread máximo"
              hint="Acima disso o mercado vai para alerta."
              value={s.maxSpreadPts}
              min={1}
              max={20}
              suffix=" pts"
              onChange={(v) => setS({ ...s, maxSpreadPts: v })}
            />
          </Card>
          <AlertSettings prefs={alerts} setPrefs={setAlerts} />
        </div>
      </div>
    </div>
  );
}
