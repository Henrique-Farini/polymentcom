import { NextResponse } from "next/server";
import { getArbitragem } from "@/lib/polymarket/arbitragem";
import { getCdi } from "@/lib/server/cdi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [r, cdi] = await Promise.all([getArbitragem(), getCdi().then((c) => c.value.annualNow).catch(() => null)]);
    return NextResponse.json({ ...r.value, cdiAnnual: cdi, stale: r.stale });
  } catch (e) {
    return NextResponse.json({ error: `Falha no radar de arbitragem: ${e instanceof Error ? e.message : e}` }, { status: 502 });
  }
}
