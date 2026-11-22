import { NextResponse } from "next/server";
import { getPolyAnalysis } from "@/lib/analise/polymarket";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function GET() {
  try {
    const r = await getPolyAnalysis();
    return NextResponse.json({ ...r.value, stale: r.stale });
  } catch (err) {
    return NextResponse.json({ error: `Falha na análise do Polymarket: ${err instanceof Error ? err.message : err}` }, { status: 502 });
  }
}
