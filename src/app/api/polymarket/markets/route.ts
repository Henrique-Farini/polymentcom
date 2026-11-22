import { NextResponse } from "next/server";
import { getMarkets } from "@/lib/polymarket/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const r = await getMarkets();
    return NextResponse.json({ markets: r.value, at: r.at, stale: r.stale, error: r.error ?? null });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Não foi possível falar com o Polymarket: ${message}` }, { status: 502 });
  }
}
