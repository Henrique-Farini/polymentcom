import { NextResponse } from "next/server";
import { editar, editarTeste, fechar, getCarteira, montarAuto, novaCarteira, ordem, startLoop, type NewOrder } from "@/lib/carteira/server";
import { cdiReturn, getCdi } from "@/lib/server/cdi";
import { isLocalRequest } from "@/lib/server/local";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const num = (v: unknown, min: number, max: number, def: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};
const stopOf = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && n < 0.9 ? n : null;
};

export async function GET() {
  startLoop();
  try {
    const c = await getCarteira();
    // Quanto o mesmo dinheiro teria rendido no CDI desde o começo do teste.
    let cdi: { since: number; annual: number } | null = null;
    if (c) {
      try {
        const idx = (await getCdi()).value;
        cdi = { since: cdiReturn(idx, c.createdAt / 1000, Date.now() / 1000), annual: idx.annualNow };
      } catch {
        /* sem CDI agora */
      }
    }
    return NextResponse.json({ carteira: c, cdi, at: Date.now() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

/** Ações: nova | ordem | auto | fechar. Só no próprio computador. */
export async function POST(req: Request) {
  if (!isLocalRequest(req)) return NextResponse.json({ error: "Disponível só no próprio computador" }, { status: 403 });
  if (!req.headers.get("content-type")?.includes("application/json")) return NextResponse.json({ error: "Formato inválido" }, { status: 415 });
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return NextResponse.json({ error: "Pedido vazio" }, { status: 400 });
  startLoop();
  try {
    let c;
    switch (b.acao) {
      case "nova":
        c = await novaCarteira(num(b.valor, 100, 10_000_000, 10_000), b.dias ? num(b.dias, 1, 365, 7) : null);
        break;
      case "ordem": {
        const area = b.area === "polymarket" ? "polymarket" : "bolsa";
        const ref = String(b.ref ?? "").slice(0, 80);
        if (!ref) throw new Error("Escolha o ativo");
        const o: NewOrder = {
          area,
          ref,
          label: String(b.label ?? ref).slice(0, 200),
          sub: String(b.sub ?? "").slice(0, 120),
          currency: area === "polymarket" || b.currency === "USD" ? "USD" : "BRL",
          amountBRL: num(b.valor, 1, 10_000_000, 0),
          stopPct: stopOf(b.stop),
          holdDays: num(b.dias, 1, 365, 7),
          wholeShares: area === "bolsa" && b.wholeShares === true,
        };
        c = await ordem(o);
        break;
      }
      case "auto":
        c = await montarAuto({
          partePoly: num(b.partePoly, 0, 0.3, 0.1),
          nAcoes: Math.round(num(b.nAcoes ?? b.nMomento, 1, 8, 4)),
          stop: stopOf(b.stop),
          holdDays: num(b.dias, 1, 365, 7),
        });
        break;
      case "fechar":
        c = await fechar(String(b.id ?? ""));
        break;
      case "editar":
        c = await editar(String(b.id ?? ""), {
          amountBRL: b.valor === undefined ? undefined : num(b.valor, 0, 10_000_000, 0),
          stopPct: b.stop === undefined ? undefined : stopOf(b.stop),
          holdDays: b.dias === undefined ? undefined : num(b.dias, 1, 365, 7),
        });
        break;
      case "editarTeste":
        c = await editarTeste({
          dias: b.dias === undefined ? undefined : b.dias ? num(b.dias, 1, 365, 7) : null,
          deposito: b.deposito ? num(b.deposito, 1, 10_000_000, 0) : undefined,
        });
        break;
      default:
        throw new Error("Ação desconhecida");
    }
    return NextResponse.json({ carteira: c, at: Date.now() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
