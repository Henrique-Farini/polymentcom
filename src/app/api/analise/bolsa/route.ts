import { NextResponse } from "next/server";
import { getBolsaAnalysis } from "@/lib/analise/bolsa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SYMBOL = /^[A-Z0-9.^=\-]{1,15}$/;

export async function GET(req: Request) {
  const symbols = (new URL(req.url).searchParams.get("symbols") ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => SYMBOL.test(s));
  try {
    const r = await getBolsaAnalysis(symbols);
    return NextResponse.json({ ...r.value, stale: r.stale });
  } catch (err) {
    return NextResponse.json({ error: `Falha na análise da bolsa: ${err instanceof Error ? err.message : err}` }, { status: 502 });
  }
}
