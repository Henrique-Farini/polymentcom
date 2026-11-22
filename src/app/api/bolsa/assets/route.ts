import { NextResponse } from "next/server";
import { getAssets } from "@/lib/bolsa/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYMBOL = /^[A-Z0-9.^=\-]{1,15}$/;

export async function GET(req: Request) {
  const param = new URL(req.url).searchParams.get("symbols") ?? "";
  const symbols = param
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => SYMBOL.test(s));
  try {
    const r = await getAssets(symbols);
    return NextResponse.json(r);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Falha ao buscar cotações: ${message}` }, { status: 502 });
  }
}
