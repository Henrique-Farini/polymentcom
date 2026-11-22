import { NextResponse } from "next/server";
import { runBacktest } from "@/lib/estrategia/backtest";
import type { Perfil } from "@/lib/perfil";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PERFIS: Perfil[] = ["conservador", "moderado", "arrojado"];

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const perfil = PERFIS.includes(q.get("perfil") as Perfil) ? (q.get("perfil") as Perfil) : "moderado";
  const n = Math.min(8, Math.max(1, Number(q.get("n")) || 4));
  const period = q.get("periodo") === "28" ? 28 : 7;
  try {
    const r = await runBacktest(perfil, n, period);
    return NextResponse.json({ ...r.value, stale: r.stale });
  } catch (e) {
    return NextResponse.json({ error: `Falha no backtest: ${e instanceof Error ? e.message : e}` }, { status: 502 });
  }
}
