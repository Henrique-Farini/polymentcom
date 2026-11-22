import type { BolsaAsset } from "@/lib/bolsa/types";
import { clamp01 } from "@/lib/indicators";
import { compose, finish, type RawComponent } from "./compose";
import type { BolsaSettings, ScoreResult } from "./types";

const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

export function scoreBolsa(a: BolsaAsset, s: BolsaSettings): ScoreResult {
  const raw: RawComponent[] = [];

  // Tendência: preço acima das médias e médias alinhadas.
  {
    let v = 0;
    const above: string[] = [];
    if (a.ma9 !== null && a.price > a.ma9) (v += 0.25), above.push("9");
    if (a.ma21 !== null && a.price > a.ma21) (v += 0.3), above.push("21");
    if (a.ma200 !== null && a.price > a.ma200) (v += 0.25), above.push("200");
    if (a.ma9 !== null && a.ma21 !== null && a.ma9 > a.ma21) v += 0.2;
    const note = above.length
      ? `Preço acima da média de ${above.join(", ")} dias`
      : "Preço abaixo das médias móveis";
    raw.push({ key: "tendencia", label: "Tendência", value: clamp01(v), note });
  }

  // Momento: RSI em zona saudável e MACD positivo/subindo.
  {
    let rsiScore = 0.5;
    let rsiNote = "RSI indisponível";
    if (a.rsi14 !== null) {
      const r = a.rsi14;
      rsiScore = r > 75 ? 0.25 : r > 70 ? 0.5 : r >= 55 ? 1 : r >= 45 ? 0.6 : r >= 35 ? 0.35 : 0.15;
      rsiNote =
        r > 70 ? `RSI ${r.toFixed(0)}: esticado (sobrecomprado)` : r < 30 ? `RSI ${r.toFixed(0)}: sobrevendido` : `RSI ${r.toFixed(0)}`;
    }
    let macdScore = 0.5;
    if (a.macdHist !== null) {
      const rising = a.macdHistPrev !== null && a.macdHist > a.macdHistPrev;
      macdScore = a.macdHist > 0 ? (rising ? 1 : 0.7) : rising ? 0.4 : 0;
    }
    const v = 0.6 * rsiScore + 0.4 * macdScore;
    const macdNote = a.macdHist === null ? "" : a.macdHist > 0 ? " · MACD positivo" : " · MACD negativo";
    raw.push({ key: "momento", label: "Momento", value: clamp01(v), note: rsiNote + macdNote });
  }

  // Volume: volume alto confirma alta; volume alto na queda é ruim.
  {
    let v = 0.5;
    let note = "Volume normal";
    if (a.volRatio !== null) {
      const r = a.volRatio;
      if (a.changePct >= 0) v = clamp01(0.4 + (r - 1) * 0.6);
      else v = clamp01(0.5 - (r - 1) * 0.5);
      note =
        a.changePct < 0
          ? r > 1.3
            ? `Volume ${r.toFixed(1)}x a média, na queda`
            : `Queda com volume fraco (${r.toFixed(1)}x a média)`
          : `Volume ${r.toFixed(1)}x a média de 20 dias`;
    }
    raw.push({ key: "volume", label: "Volume", value: v, note });
  }

  // Volatilidade: posição nas Bandas de Bollinger e tamanho do ATR.
  {
    let v = 0.5;
    let note = "Volatilidade indisponível";
    if (a.percentB !== null) {
      const b = a.percentB;
      v = b > 1.05 ? 0.35 : b >= 0.55 ? 1 : b >= 0.3 ? 0.6 : b >= 0 ? 0.3 : 0.15;
      note = b > 1 ? "Acima da banda de Bollinger (esticado)" : b < 0 ? "Abaixo da banda de Bollinger" : `Bollinger %B ${b.toFixed(2)}`;
    }
    if (a.atrPct !== null && a.atrPct > 5) {
      v *= 0.7;
      note += ` · ATR alto (${a.atrPct.toFixed(1)}%)`;
    }
    raw.push({ key: "volatilidade", label: "Volatilidade", value: clamp01(v), note });
  }

  // Variação do dia.
  raw.push({
    key: "dia",
    label: "Dia",
    value: clamp01((a.changePct + 2) / 5),
    note: `Variação do dia ${pct(a.changePct)}`,
  });

  const { score, components } = compose(raw, s.weights);

  const alerts: string[] = [];
  if (a.changePct <= -Math.abs(s.dropPct)) alerts.push(`Caiu ${pct(a.changePct)} hoje`);
  if (a.rsi14 !== null && a.rsi14 < 30 && a.macdHist !== null && a.macdHist < 0)
    alerts.push(`RSI ${a.rsi14.toFixed(0)} com MACD negativo: queda forte`);
  if (a.ma200 !== null && a.price < a.ma200 && a.changePct <= -2)
    alerts.push("Perdeu a média de 200 dias e segue caindo");
  if (a.changePct < 0 && a.volRatio !== null && a.volRatio >= 2)
    alerts.push(`Queda com volume ${a.volRatio.toFixed(1)}x acima do normal`);
  if (score < s.alertScore) alerts.push(`Score baixo (${score})`);

  return finish(score, components, alerts, s.minScore);
}
