"use client";

export interface HeatItem {
  id: string;
  label: string;
  /** Variação usada para a cor (positivo = verde). */
  change: number;
  /** Texto exibido abaixo do rótulo. */
  changeText: string;
  title?: string;
}

/** Cor do quadrado: `scale` é a variação que já dá a cor mais forte. */
export function heatColor(change: number, scale: number) {
  const k = Math.min(1, Math.abs(change) / scale);
  if (Math.abs(change) < scale * 0.0125) return { bg: "#1b2422", fg: "#9aa7a4" };
  const [r, g, b] = change > 0 ? [22, 163, 74] : [220, 38, 38];
  return { bg: `rgba(${r},${g},${b},${0.18 + k * 0.72})`, fg: "#ffffff" };
}

/** Mapa de calor: cada quadrado é um item, colorido pela variação. */
export function Heatmap({
  items,
  selected,
  onSelect,
  scale,
  legend,
  tileWidth = 84,
}: {
  items: HeatItem[];
  selected: string | null;
  onSelect: (id: string) => void;
  scale: number;
  legend: [string, string];
  tileWidth?: number;
}) {
  const sorted = [...items].sort((a, b) => b.change - a.change);
  return (
    <div>
      <div className="focus-group grid gap-1" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${tileWidth}px, 1fr))` }}>
        {sorted.map((it) => {
          const c = heatColor(it.change, scale);
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => onSelect(it.id)}
              className={`focus-item flex h-14 flex-col items-center justify-center overflow-hidden rounded px-1 transition-transform hover:scale-[1.04] ${
                it.id === selected ? "ring-2 ring-white/80" : ""
              }`}
              style={{ background: c.bg, color: c.fg }}
              title={it.title}
            >
              <span className="num w-full truncate text-center text-xs font-bold">{it.label}</span>
              <span className="num text-[11px] opacity-90">{it.changeText}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex items-center justify-end gap-1 text-[10px] text-muted">
        <span>{legend[0]}</span>
        {[-1, -0.5, -0.125, 0, 0.125, 0.5, 1].map((v) => (
          <span key={v} className="h-2 w-5 rounded-sm" style={{ background: heatColor(v * scale, scale).bg }} />
        ))}
        <span>{legend[1]}</span>
      </div>
    </div>
  );
}
