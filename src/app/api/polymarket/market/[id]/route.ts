import { NextResponse } from "next/server";
import { getMarketDetail } from "@/lib/polymarket/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: "id inválido" }, { status: 400 });
  const range = new URL(req.url).searchParams.get("range") ?? "1s";
  try {
    const r = await getMarketDetail(id, range);
    return NextResponse.json({ ...r.value, at: r.at, stale: r.stale });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Não foi possível carregar o mercado: ${message}` }, { status: 502 });
  }
}
