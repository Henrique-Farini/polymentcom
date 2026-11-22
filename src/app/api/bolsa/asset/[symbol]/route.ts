import { NextResponse } from "next/server";
import { getAssetDetail } from "@/lib/bolsa/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ symbol: string }> }) {
  const symbol = decodeURIComponent((await params).symbol).toUpperCase();
  if (!/^[A-Z0-9.^=\-]{1,15}$/.test(symbol)) return NextResponse.json({ error: "código inválido" }, { status: 400 });
  const range = new URL(req.url).searchParams.get("range") ?? "6m";
  try {
    const r = await getAssetDetail(symbol, range);
    return NextResponse.json({ ...r.value, at: r.at, stale: r.stale });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Falha ao carregar ${symbol}: ${message}` }, { status: 502 });
  }
}
