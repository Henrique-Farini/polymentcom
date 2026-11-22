"use client";

import { Card } from "./ui";

export interface Field {
  key: string;
  label: string;
  hint: string;
}

export function WeightsEditor({
  fields,
  weights,
  onChange,
}: {
  fields: Field[];
  weights: Record<string, number>;
  onChange: (w: Record<string, number>) => void;
}) {
  const total = fields.reduce((a, f) => a + (weights[f.key] ?? 0), 0) || 1;
  return (
    <Card className="p-4">
      <h2 className="text-sm font-semibold">Pesos do score</h2>
      <p className="mt-1 text-xs text-muted">Quanto cada critério conta no score final (0–100). Os rankings recalculam na hora.</p>
      <div className="mt-4 space-y-4">
        {fields.map((f) => {
          const w = weights[f.key] ?? 0;
          return (
            <label key={f.key} className="block">
              <div className="flex items-baseline justify-between text-sm">
                <span>{f.label}</span>
                <span className="num text-muted">
                  peso <span className="text-text">{w}</span> · {((w / total) * 100).toFixed(0)}% do score
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={50}
                value={w}
                onChange={(e) => onChange({ ...weights, [f.key]: Number(e.target.value) })}
                className="mt-1 w-full"
              />
              <div className="text-xs text-muted">{f.hint}</div>
            </label>
          );
        })}
      </div>
    </Card>
  );
}

export function NumberSetting({
  label,
  hint,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix = "",
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
}) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between text-sm">
        <span>{label}</span>
        <span className="num text-text">
          {value.toLocaleString("pt-BR")}
          {suffix}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-1 w-full" />
      <div className="text-xs text-muted">{hint}</div>
    </label>
  );
}
