import { NextResponse } from "next/server";
import { getPolyBacktest } from "@/lib/polymarket/backtest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  try {
    const r = await getPolyBacktest();
    return NextResponse.json({ ...r.value, stale: r.stale });
  } catch (e) {
    return NextResponse.json({ error: `Falha no teste do Polymarket: ${e instanceof Error ? e.message : e}` }, { status: 502 });
  }
}
