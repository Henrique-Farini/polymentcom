import { NextResponse } from "next/server";
import { fetchChart } from "@/lib/bolsa/server";
import { DEFAULT_UNIVERSE, displaySymbol } from "@/lib/bolsa/universe";
import { cached } from "@/lib/server/cache";
import { simGrid, simulateAll, summarizeTrades, type Bar } from "@/lib/simulador";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYMBOL = /^[A-Z0-9.^=\-]{1,15}$/;

async function bars(symbol: string) {
  const r = await cached(`sim:bars:adj:${symbol}`, 60 * 60_000, async () => {
    const { meta, candles } = await fetchChart(symbol, "5y", "1d", { adjusted: true });
    const b: Bar[] = candles.map((c) => ({ open: c.open, high: c.high, low: c.low, close: c.close }));
    if (b.length && meta.regularMarketPrice) b[b.length - 1].close = meta.regularMarketPrice;
    const known = DEFAULT_UNIVERSE.find((u) => u.symbol === symbol);
    return {
      bars: b,
      name: known?.name ?? meta.longName ?? meta.shortName ?? symbol,
      currency: meta.currency ?? "",
      grid: simGrid(b),
    };
  });
  return r.value;
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const symbol = (q.get("symbol") ?? "").trim().toUpperCase();
  const days = Math.round(Number(q.get("dias") ?? 20));
  const stopRaw = Number(q.get("stop") ?? 0);
  if (!SYMBOL.test(symbol)) return NextResponse.json({ error: "Código de ativo inválido" }, { status: 400 });
  if (!(days >= 1 && days <= 250)) return NextResponse.json({ error: "Prazo deve ficar entre 1 e 250 pregões" }, { status: 400 });
  const stop = stopRaw > 0 && stopRaw < 0.9 ? stopRaw : null;

  try {
    const d = await bars(symbol);
    if (d.bars.length < days + 30) return NextResponse.json({ error: "Histórico curto demais para esse prazo" }, { status: 422 });
    return NextResponse.json({
      symbol,
      display: displaySymbol(symbol),
      name: d.name,
      currency: d.currency,
      years: Math.round((d.bars.length / 252) * 10) / 10,
      days,
      stop,
      result: summarizeTrades(simulateAll(d.bars, days, stop)),
      noStop: stop === null ? null : summarizeTrades(simulateAll(d.bars, days, null)),
      grid: d.grid,
      at: Date.now(),
    });
  } catch (err) {
    return NextResponse.json({ error: `Falha ao simular: ${err instanceof Error ? err.message : err}` }, { status: 502 });
  }
}
