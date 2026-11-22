"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Card, LiveBadge } from "@/components/ui";
import { positionPnl, positionValue, totalValue } from "@/lib/carteira/engine";
import { estimateTax, TAX_LABEL } from "@/lib/carteira/ir";
import type { Carteira, CarteiraEvent, EquityPoint, Position } from "@/lib/carteira/types";
import { B3_EQUIVALENT, DEFAULT_UNIVERSE, displaySymbol, execSymbol } from "@/lib/bolsa/universe";
import { useConta } from "@/lib/client/conta";
import { usePolling, useNow } from "@/lib/client/hooks";
import type { PolyMarket } from "@/lib/polymarket/types";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pc = (x: number, d = 2) => `${x > 0 ? "+" : ""}${(x * 100).toFixed(d)}%`;
const tone = (x: number) => (x > 0.005 ? "text-up" : x < -0.005 ? "text-down" : "text-muted");
const sel = "rounded-lg border border-line bg-card2 px-2.5 py-1.5 text-sm outline-none focus:border-info";

function left(ms: number) {
  if (ms <= 0) return "agora";
  const h = ms / 3_600_000;
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `${Math.round(h)} h`;
  return `${Math.round(h / 24)} dias`;
}

const dt = (t: number) => new Date(t).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

async function post(body: Record<string, unknown>) {
  const r = await fetch("/api/carteira", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? `Erro ${r.status}`);
  return j as { carteira: Carteira };
}

export default function CarteiraPage() {
  const poll = usePolling<{ carteira: Carteira | null; cdi: { since: number; annual: number } | null; at: number }>("/api/carteira", 30_000);
  const [local, setLocal] = useState<Carteira | null | undefined>(undefined);
  const c = local !== undefined && (!poll.data || (local?.lastCheck ?? 0) >= (poll.data.carteira?.lastCheck ?? 0)) ? local : poll.data?.carteira ?? null;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [panel, setPanel] = useState<null | "editar" | "recomecar">(null);
  const now = useNow(30_000);

  async function act(body: Record<string, unknown>) {
    setBusy(true);
    setErr(null);
    try {
      const r = await post(body);
      setLocal(r.carteira);
      poll.refresh();
      return true;
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  useNotifyEvents(c?.events ?? null);

  if (!poll.data && poll.status === "carregando") return <p className="text-sm text-muted">Carregando a carteira…</p>;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Carteira de teste</h1>
          <p className="mt-1 text-sm text-muted">
            <span className="mr-2 rounded bg-warn/15 px-1.5 py-0.5 text-xs font-semibold text-warn">DINHEIRO FICTÍCIO</span>
            Preços reais, regras reais de prazo e stop. Nenhuma ordem vai para corretora.
          </p>
        </div>
        {c && (
          <div className="flex flex-col items-end gap-2">
            <LiveBadge status={c.lastError ? "atrasado" : poll.status} updatedAt={c.lastCheck} every="1 min" error={c.lastError} />
            <div className="flex gap-2">
              <button type="button" onClick={() => setPanel(panel === "editar" ? null : "editar")} className={`rounded-lg border px-3 py-1.5 text-sm ${panel === "editar" ? "border-info text-info" : "border-line hover:border-info"}`}>
                Editar teste
              </button>
              <button type="button" onClick={() => setPanel(panel === "recomecar" ? null : "recomecar")} className={`rounded-lg border px-3 py-1.5 text-sm ${panel === "recomecar" ? "border-down text-down" : "border-line hover:border-down"}`}>
                Recomeçar do zero
              </button>
            </div>
          </div>
        )}
      </header>

      {c && panel === "editar" && (
        <EditarTeste
          c={c}
          busy={busy}
          onSave={(o) => act({ acao: "editarTeste", ...o }).then((ok) => ok && setPanel(null))}
        />
      )}
      {c && panel === "recomecar" && (
        <Card className="border-down/40 p-4">
          <h2 className="text-sm font-semibold">Recomeçar do zero</h2>
          <p className="mb-3 mt-1 text-xs text-muted">Apaga esta carteira de teste (posições e histórico) e cria outra. Depois é só investir de novo.</p>
          <Criar busy={busy} compact onCreate={(valor, dias) => act({ acao: "nova", valor, dias }).then((ok) => ok && setPanel(null))} />
        </Card>
      )}

      {err && <p className="rounded-lg border border-down/40 bg-down/10 px-3 py-2 text-sm text-down">{err}</p>}

      {!c ? (
        <Criar busy={busy} onCreate={(valor, dias) => act({ acao: "nova", valor, dias })} />
      ) : (
        <>
          <Resumo c={c} now={now} />
          <RaioX c={c} cdi={poll.data?.cdi ?? null} />
          <Card className="p-4">
            <h2 className="text-sm font-semibold">Patrimônio ao longo do teste</h2>
            <p className="mb-2 text-xs text-muted">Linha tracejada = valor inicial. Passe o mouse para ver cada momento.</p>
            <EquityChart points={c.equity} base={c.startCash} />
          </Card>

          {c.cash >= 1 && <Investir c={c} busy={busy} onAuto={(o) => act({ acao: "auto", ...o })} onOrder={(o) => act({ acao: "ordem", ...o })} />}

          <Posicoes
            c={c}
            now={now}
            busy={busy}
            onClose={(id) => act({ acao: "fechar", id })}
            onEdit={(id, e) => act({ acao: "editar", id, ...e })}
          />
          <Fechadas c={c} />
          <Diario events={c.events} />
        </>
      )}

      <p className="text-xs text-muted">
        Como funciona: o servidor do app confere os preços a cada minuto, mesmo com esta página fechada, desde que o computador esteja ligado e o{" "}
        <code className="num">npm run dev</code> rodando. Ações da B3 só compram com o pregão aberto (seg. a sex., 10h às 17h) e têm atraso de até 15 min. Polymarket compra pelo preço de venda do livro e
        é avaliado pelo preço de compra, como na vida real. Ativos em dólar incluem a variação do dólar. Não inclui impostos.
      </p>
    </div>
  );
}

/* ----------------------------- criar ----------------------------- */

function Criar({ busy, onCreate, compact }: { busy: boolean; onCreate: (valor: number, dias: number) => void; compact?: boolean }) {
  const [valor, setValor] = useState(10_000);
  const [dias, setDias] = useState(7);
  const body = (
    <div className="flex flex-wrap items-end gap-3">
      <label className="text-sm">
        <span className="block text-xs text-muted">Dinheiro fictício (R$)</span>
        <input className={`${sel} num mt-1 w-36`} inputMode="numeric" value={valor} onChange={(e) => setValor(Number(e.target.value.replace(/\D/g, "")) || 0)} />
      </label>
      <label className="text-sm">
        <span className="block text-xs text-muted">Duração do teste</span>
        <select className={`${sel} mt-1`} value={dias} onChange={(e) => setDias(Number(e.target.value))}>
          {[7, 14, 30, 90].map((d) => (
            <option key={d} value={d}>{d === 7 ? "1 semana" : d === 14 ? "2 semanas" : d === 30 ? "1 mês" : "3 meses"}</option>
          ))}
        </select>
      </label>
      <button type="button" disabled={busy || valor < 100} onClick={() => onCreate(valor, dias)} className="rounded-lg bg-info px-4 py-2 text-sm font-semibold text-black disabled:opacity-40">
        {compact ? "Criar nova" : "Criar carteira de teste"}
      </button>
    </div>
  );
  if (compact) return body;
  return (
    <Card className="border-info/40 p-5">
      <h2 className="text-base font-semibold">Comece com dinheiro de mentira</h2>
      <p className="mb-4 mt-1 text-sm text-muted">Escolha quanto dinheiro fictício usar e por quanto tempo vai durar o teste. Depois você investe na mão ou deixa o app montar a carteira.</p>
      {body}
    </Card>
  );
}

/* ----------------------------- resumo ----------------------------- */

function Resumo({ c, now }: { c: Carteira; now: number }) {
  const total = totalValue(c);
  const pnl = total - c.startCash;
  const invested = c.positions.filter((p) => p.status !== "fechada").reduce((s, p) => s + positionValue(p), 0);
  const realized = c.positions.filter((p) => p.status === "fechada").reduce((s, p) => s + (p.pnlBRL ?? 0), 0);
  const day = Math.min(7, Math.max(1, Math.ceil((now - c.createdAt) / 86_400_000)));
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Card className="p-4">
        <div className="text-xs text-muted">Patrimônio</div>
        <div className="num mt-1 text-2xl font-semibold">{brl(total)}</div>
        <div className="num text-xs text-muted">começou com {brl(c.startCash)}</div>
      </Card>
      <Card className="p-4">
        <div className="text-xs text-muted">Resultado até agora</div>
        <div className={`num mt-1 text-2xl font-semibold ${tone(pnl / c.startCash)}`}>
          {pnl >= 0 ? "+" : ""}
          {brl(pnl)}
        </div>
        <div className={`num text-xs ${tone(pnl / c.startCash)}`}>{pc(pnl / c.startCash)} · já realizado {brl(realized)}</div>
      </Card>
      <Card className="p-4">
        <div className="text-xs text-muted">Investido / em caixa</div>
        <div className="num mt-1 text-2xl font-semibold">{brl(invested)}</div>
        <div className="num text-xs text-muted">{brl(c.cash)} parado em caixa</div>
      </Card>
      <Card className="p-4">
        <div className="text-xs text-muted">Fim do teste</div>
        <div className="mt-1 text-2xl font-semibold">{c.endsAt ? (c.endsAt > now ? `em ${left(c.endsAt - now)}` : "terminou") : "sem data"}</div>
        <div className="text-xs text-muted">{c.endsAt ? `${dt(c.endsAt)}${c.endsAt > now && c.endsAt - c.createdAt <= 8 * 86_400_000 ? ` · dia ${day} de 7` : ""}` : ""}</div>
      </Card>
    </div>
  );
}

/* ----------------------------- gráfico ----------------------------- */

function EquityChart({ points, base }: { points: EquityPoint[]; base: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const W = 900;
  const H = 220;
  const pad = { l: 64, r: 12, t: 10, b: 24 };
  if (points.length < 2) return <p className="py-10 text-center text-sm text-muted">O gráfico aparece depois das primeiras leituras de preço.</p>;
  const t0 = points[0].t;
  const t1 = points[points.length - 1].t;
  const vals = points.map((p) => p.value);
  const lo = Math.min(base, ...vals);
  const hi = Math.max(base, ...vals);
  const span = hi - lo || base * 0.01;
  const yMin = lo - span * 0.15;
  const yMax = hi + span * 0.15;
  const sx = (t: number) => pad.l + ((t - t0) / (t1 - t0 || 1)) * (W - pad.l - pad.r);
  const sy = (v: number) => pad.t + ((yMax - v) / (yMax - yMin)) * (H - pad.t - pad.b);
  const d = points.map((p, i) => `${i ? "L" : "M"}${sx(p.t).toFixed(1)},${sy(p.value).toFixed(1)}`).join("");
  const last = points[points.length - 1];
  const up = last.value >= base;
  const color = up ? "#22c55e" : "#ef4444";
  const area = `${d}L${sx(t1)},${sy(yMin)}L${sx(t0)},${sy(yMin)}Z`;
  const h = hover !== null ? points[hover] : null;
  const ticks = [yMin + (yMax - yMin) * 0.15, (yMin + yMax) / 2, yMax - (yMax - yMin) * 0.15];

  function onMove(e: React.MouseEvent) {
    const r = svg.current!.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    const t = t0 + ((x - pad.l) / (W - pad.l - pad.r)) * (t1 - t0);
    let best = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(points[i].t - t) < Math.abs(points[best].t - t)) best = i;
    setHover(best);
  }

  return (
    <div className="relative">
      <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label="Patrimônio da carteira ao longo do tempo">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={sy(v)} y2={sy(v)} stroke="#1a2321" />
            <text x={pad.l - 6} y={sy(v) + 3} fontSize="10" fill="#7c8a87" textAnchor="end">{brl(v).replace(",00", "")}</text>
          </g>
        ))}
        <line x1={pad.l} x2={W - pad.r} y1={sy(base)} y2={sy(base)} stroke="#7c8a87" strokeDasharray="4 4" />
        <path d={area} fill={color} opacity={0.08} />
        <path d={d} fill="none" stroke={color} strokeWidth={2} />
        <text x={pad.l} y={H - 6} fontSize="10" fill="#7c8a87">{dt(t0)}</text>
        <text x={W - pad.r} y={H - 6} fontSize="10" fill="#7c8a87" textAnchor="end">{dt(t1)}</text>
        {h && (
          <g>
            <line x1={sx(h.t)} x2={sx(h.t)} y1={pad.t} y2={H - pad.b} stroke="#4b5a57" />
            <circle cx={sx(h.t)} cy={sy(h.value)} r={5} fill={color} stroke="#111716" strokeWidth={2} />
          </g>
        )}
      </svg>
      {h && (
        <div className="num pointer-events-none absolute top-1 right-2 rounded-md border border-line bg-bg/95 px-2.5 py-1 text-xs">
          {dt(h.t)} · <b>{brl(h.value)}</b> <span className={tone(h.value / base - 1)}>({pc(h.value / base - 1)})</span>
        </div>
      )}
    </div>
  );
}

/* ----------------------------- investir ----------------------------- */

function Investir({
  c,
  busy,
  onAuto,
  onOrder,
}: {
  c: Carteira;
  busy: boolean;
  onAuto: (o: Record<string, unknown>) => void;
  onOrder: (o: Record<string, unknown>) => void;
}) {
  const [conta] = useConta();
  const [tab, setTab] = useState<"auto" | "manual">("auto");
  const [partePoly, setPartePoly] = useState(0.1);
  const [stop, setStop] = useState(0);
  const [nAcoes, setNAcoes] = useState(4);
  const daysLeft = c.endsAt ? Math.max(1, Math.round((c.endsAt - Date.now()) / 86_400_000)) : 7;
  const [dias, setDias] = useState(daysLeft);

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Investir {brl(c.cash)} em caixa</h2>
        <div className="inline-flex rounded-lg border border-line bg-card p-0.5 text-xs">
          {(["auto", "manual"] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)} className={`rounded-md px-2.5 py-1 font-medium ${tab === t ? "bg-info text-black" : "text-muted hover:text-text"}`}>
              {t === "auto" ? "O app escolhe" : "Eu escolho"}
            </button>
          ))}
        </div>
      </div>

      {tab === "auto" ? (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-muted">
            <b className="text-text">Regra nova: um terço em cada parte.</b> Núcleo (BOVA11 e IVVB11, o mercado brasileiro e o americano inteiros), as ações que mais subiram em 12 meses (momento) e as que menos oscilam (baixa volatilidade).
            Ações americanas entram como BDR e cripto como ETF da B3, sempre em ações inteiras. Foi a regra mais equilibrada no{" "}
            <Link href="/analise?aba=estrategias" className="text-info hover:underline">teste de 16 anos</Link>. Não usa o seu perfil.
          </p>
          <div className="flex flex-wrap items-end gap-3 text-sm">
            <Lbl t="Ações por parte">
              <select className={sel} value={nAcoes} onChange={(e) => setNAcoes(Number(e.target.value))}>
                {[3, 4, 5, 6].map((n) => <option key={n}>{n}</option>)}
              </select>
            </Lbl>
            <Lbl t="Parte no Polymarket">
              <select className={sel} value={partePoly} onChange={(e) => setPartePoly(Number(e.target.value))}>
                <option value={0}>Nada</option>
                <option value={0.05}>5%</option>
                <option value={0.1}>10%</option>
                <option value={0.2}>20%</option>
              </select>
            </Lbl>
            <Lbl t="Stop nas ações">
              <select className={sel} value={stop} onChange={(e) => setStop(Number(e.target.value))}>
                {[0, 0.1, 0.15, 0.2].map((s) => <option key={s} value={s}>{s ? `${s * 100}%` : "sem stop (melhor no teste)"}</option>)}
              </select>
            </Lbl>
            <Lbl t="Segurar por">
              <select className={sel} value={dias} onChange={(e) => setDias(Number(e.target.value))}>
                {[...new Set([daysLeft, 3, 5, 7, 14, 30])].sort((a, b) => a - b).map((d) => <option key={d} value={d}>{d} dias</option>)}
              </select>
            </Lbl>
            <button
              type="button"
              disabled={busy}
              onClick={() => onAuto({ partePoly, nAcoes, stop, dias })}
              className="rounded-lg bg-info px-4 py-2 font-semibold text-black disabled:opacity-40"
            >
              {busy ? "Montando…" : "Montar carteira"}
            </button>
          </div>
          <p className="text-xs text-muted">Polymarket: só entra em mercados que terminam dentro do prazo e segura até o resultado, sem pagar o spread de novo para sair.</p>
        </div>
      ) : (
        <Manual cash={c.cash} busy={busy} defaultDays={daysLeft} defaultStop={conta.stop || 0.08} onOrder={onOrder} />
      )}
    </Card>
  );
}

function Lbl({ t, children }: { t: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted">{t}</span>
      {children}
    </label>
  );
}

function Manual({ cash, busy, defaultDays, defaultStop, onOrder }: { cash: number; busy: boolean; defaultDays: number; defaultStop: number; onOrder: (o: Record<string, unknown>) => void }) {
  const [area, setArea] = useState<"bolsa" | "polymarket">("bolsa");
  const markets = usePolling<{ markets: PolyMarket[]; at: number }>(area === "polymarket" ? "/api/polymarket/markets" : null, 60_000);
  const bolsaOpts = DEFAULT_UNIVERSE.filter((u) => !u.symbol.startsWith("^") && !u.symbol.endsWith("=X"));
  const polyOpts = useMemo(
    () => (markets.data?.markets ?? []).filter((m) => m.probability > 0.03 && m.probability < 0.97).slice(0, 40),
    [markets.data],
  );
  const [ref, setRef] = useState(bolsaOpts[0].symbol);
  const [valor, setValor] = useState(Math.min(1000, Math.floor(cash)));
  const [stop, setStop] = useState(defaultStop);
  const [dias, setDias] = useState(defaultDays);

  useEffect(() => {
    if (area === "bolsa") setRef(bolsaOpts[0].symbol);
    else if (polyOpts[0]) setRef(polyOpts[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area, polyOpts.length]);

  function send() {
    if (area === "bolsa") {
      const u = DEFAULT_UNIVERSE.find((x) => x.symbol === ref)!;
      const exec = execSymbol(ref);
      const eqv = B3_EQUIVALENT[ref];
      onOrder({ area, ref: exec, label: displaySymbol(exec), sub: eqv ? `${eqv.note} · ${u.name}` : u.name, currency: "BRL", valor, stop, dias, wholeShares: true });
    } else {
      const m = polyOpts.find((x) => x.id === ref);
      if (!m) return;
      onOrder({ area, ref, label: `${m.outcomes[0] ?? "Sim"} · ${m.question}`, sub: m.category, valor, stop, dias });
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-end gap-3 text-sm">
      <Lbl t="Onde">
        <select className={sel} value={area} onChange={(e) => setArea(e.target.value as "bolsa" | "polymarket")}>
          <option value="bolsa">Bolsa</option>
          <option value="polymarket">Polymarket</option>
        </select>
      </Lbl>
      <Lbl t={area === "bolsa" ? "Ativo" : "Mercado (compra o primeiro resultado)"}>
        <select className={`${sel} max-w-md`} value={ref} onChange={(e) => setRef(e.target.value)}>
          {area === "bolsa"
            ? bolsaOpts.map((u) => (
                <option key={u.symbol} value={u.symbol}>
                  {displaySymbol(execSymbol(u.symbol))} · {u.name}
                  {B3_EQUIVALENT[u.symbol] ? ` (${B3_EQUIVALENT[u.symbol].note})` : ""}
                </option>
              ))
            : polyOpts.map((m) => <option key={m.id} value={m.id}>{Math.round(m.probability * 100)}% · {m.question}</option>)}
        </select>
      </Lbl>
      <Lbl t="Valor (R$)">
        <input className={`${sel} num w-28`} inputMode="numeric" value={valor} onChange={(e) => setValor(Number(e.target.value.replace(/\D/g, "")) || 0)} />
      </Lbl>
      <Lbl t="Stop">
        <select className={sel} value={stop} onChange={(e) => setStop(Number(e.target.value))}>
          {[0, 0.03, 0.05, 0.08, 0.1, 0.15, 0.2, 0.3].map((s) => <option key={s} value={s}>{s ? `${Math.round(s * 100)}%` : "sem stop"}</option>)}
        </select>
      </Lbl>
      <Lbl t="Segurar por">
        <select className={sel} value={dias} onChange={(e) => setDias(Number(e.target.value))}>
          {[...new Set([defaultDays, 1, 3, 5, 7, 14, 30])].sort((a, b) => a - b).map((d) => <option key={d} value={d}>{d} dias</option>)}
        </select>
      </Lbl>
      <button type="button" disabled={busy || valor <= 0 || valor > cash} onClick={send} className="rounded-lg bg-info px-4 py-2 font-semibold text-black disabled:opacity-40">
        Comprar
      </button>
    </div>
  );
}

/* ----------------------------- posições ----------------------------- */

type EditFn = (id: string, e: { valor?: number; stop?: number; dias?: number }) => Promise<boolean>;

function Posicoes({ c, now, busy, onClose, onEdit }: { c: Carteira; now: number; busy: boolean; onClose: (id: string) => void; onEdit: EditFn }) {
  const open = c.positions.filter((p) => p.status !== "fechada");
  if (!open.length) return null;
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold">Posições abertas ({open.length})</h2>
        <p className="text-xs text-muted">A barra mostra onde está o preço entre o stop (esquerda) e o ponto de compra.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-card2 text-[10px] uppercase tracking-wider text-muted">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Ativo</th>
              <th className="px-2 py-2 text-right font-medium">Investido</th>
              <th className="px-2 py-2 text-right font-medium">Vale agora</th>
              <th className="px-2 py-2 text-right font-medium">Resultado</th>
              <th className="px-2 py-2 text-left font-medium">Até o stop</th>
              <th className="px-2 py-2 text-right font-medium">Vende em</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="focus-group">
            {open.map((p) => (
              <PosRow key={p.id} p={p} now={now} busy={busy} cash={c.cash} onClose={onClose} onEdit={onEdit} />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function href(p: Position) {
  return p.area === "bolsa" ? `/bolsa/ativo/${encodeURIComponent(p.ref)}` : `/polymarket/mercado/${p.ref}`;
}

function PosRow({
  p,
  now,
  busy,
  cash,
  onClose,
  onEdit,
}: {
  p: Position;
  now: number;
  busy: boolean;
  cash: number;
  onClose: (id: string) => void;
  onEdit: EditFn;
}) {
  const [editing, setEditing] = useState(false);
  const pnl = positionPnl(p);
  const r = pnl / p.amountBRL;
  const pending = p.status === "pendente";
  const priceRet = p.entryPrice && p.lastPrice ? p.lastPrice / p.entryPrice - 1 : 0;
  // 0 = no stop, 1 = no preço de compra ou acima.
  const stopPos = p.stopPct ? Math.max(0, Math.min(1, (priceRet + p.stopPct) / p.stopPct)) : null;
  return (
    <>
    <tr className={`focus-item border-b border-line/50 ${editing ? "bg-card2/60" : ""}`}>
      <td className="max-w-[18rem] px-3 py-2">
        <Link href={href(p)} className="block truncate font-semibold hover:underline" title={p.label}>
          <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${p.area === "bolsa" ? "bg-up" : "bg-poly"}`} />
          {p.label}
        </Link>
        <div className="truncate text-[11px] text-muted">{pending ? "⏳ aguardando o mercado abrir para comprar" : `${p.sub} · comprou ${dt(p.filledAt!)}`}</div>
      </td>
      <td className="num px-2 text-right">{brl(p.amountBRL)}</td>
      <td className="num px-2 text-right">{pending ? "–" : brl(positionValue(p))}</td>
      <td className={`num px-2 text-right font-semibold ${tone(r)}`}>{pending ? "–" : `${pnl >= 0 ? "+" : ""}${brl(pnl)} (${pc(r)})`}</td>
      <td className="px-2">
        {stopPos === null ? (
          <span className="text-xs text-muted">sem stop</span>
        ) : pending ? (
          <span className="text-xs text-muted">{Math.round((p.stopPct ?? 0) * 100)}%</span>
        ) : (
          <div className="w-28" title={`Stop ${Math.round((p.stopPct ?? 0) * 100)}% · preço ${pc(priceRet)} desde a compra`}>
            <div className="h-1.5 overflow-hidden rounded bg-down/30">
              <div className={`h-full ${stopPos < 0.35 ? "bg-down" : stopPos < 0.7 ? "bg-warn" : "bg-up"}`} style={{ width: `${stopPos * 100}%` }} />
            </div>
            <div className="num mt-0.5 text-[10px] text-muted">{p.stopPct ? `${((priceRet + p.stopPct) * 100).toFixed(1)} pts de folga` : ""}</div>
          </div>
        )}
      </td>
      <td className="num px-2 text-right text-xs text-muted">{p.exitAt ? left(p.exitAt - now) : `${p.holdDays} dias após comprar`}</td>
      <td className="whitespace-nowrap px-3 text-right">
        <button type="button" onClick={() => setEditing((x) => !x)} className={`mr-1 rounded border px-2 py-0.5 text-xs ${editing ? "border-info text-info" : "border-line text-muted hover:border-info hover:text-info"}`}>
          Editar
        </button>
        <button type="button" disabled={busy} onClick={() => confirm(`${pending ? "Cancelar a ordem de" : "Vender agora"} ${p.label}?`) && onClose(p.id)} className="rounded border border-line px-2 py-0.5 text-xs text-muted hover:border-down hover:text-down">
          {pending ? "Cancelar" : "Vender"}
        </button>
      </td>
    </tr>
    {editing && (
      <tr className="border-b border-line/50 bg-card2/60">
        <td colSpan={7} className="px-3 py-3">
          <EditRow p={p} cash={cash} busy={busy} onCancel={() => setEditing(false)} onSave={(e) => onEdit(p.id, e).then((ok) => ok && setEditing(false))} />
        </td>
      </tr>
    )}
    </>
  );
}

function EditRow({
  p,
  cash,
  busy,
  onCancel,
  onSave,
}: {
  p: Position;
  cash: number;
  busy: boolean;
  onCancel: () => void;
  onSave: (e: { valor?: number; stop?: number; dias?: number }) => void;
}) {
  const pending = p.status === "pendente";
  const [valor, setValor] = useState(Math.round(p.amountBRL));
  const [stop, setStop] = useState(p.stopPct ?? 0);
  const [dias, setDias] = useState(p.holdDays);
  const max = Math.floor(p.amountBRL + cash);
  const stops = p.area === "polymarket" ? [0, 0.1, 0.2, 0.3, 0.5] : [0, 0.03, 0.05, 0.08, 0.1, 0.15, 0.2];
  return (
    <div className="flex flex-wrap items-end gap-3 text-sm">
      {pending ? (
        <Lbl t={`Valor (R$) · máx. ${brl(max)}`}>
          <input className={`${sel} num w-32`} inputMode="numeric" value={valor} onChange={(e) => setValor(Number(e.target.value.replace(/\D/g, "")) || 0)} />
        </Lbl>
      ) : (
        <p className="max-w-56 text-xs text-muted">Já comprado: o valor não muda. Para mudar, venda e compre de novo.</p>
      )}
      <Lbl t="Stop">
        <select className={sel} value={stop} onChange={(e) => setStop(Number(e.target.value))}>
          {[...new Set([...stops, p.stopPct ?? 0])].sort((a, b) => a - b).map((s) => (
            <option key={s} value={s}>{s ? `${Math.round(s * 100)}%` : "sem stop"}</option>
          ))}
        </select>
      </Lbl>
      <Lbl t={pending ? "Segurar por (após comprar)" : "Segurar por (desde a compra)"}>
        <select className={sel} value={dias} onChange={(e) => setDias(Number(e.target.value))}>
          {[...new Set([p.holdDays, 1, 3, 5, 7, 14, 30])].sort((a, b) => a - b).map((d) => (
            <option key={d} value={d}>{d} dias</option>
          ))}
        </select>
      </Lbl>
      <button
        type="button"
        disabled={busy || (pending && (valor <= 0 || valor > max))}
        onClick={() => onSave({ ...(pending ? { valor } : {}), stop, dias })}
        className="rounded-lg bg-info px-4 py-2 font-semibold text-black disabled:opacity-40"
      >
        Salvar
      </button>
      <button type="button" onClick={onCancel} className="px-2 py-2 text-muted hover:text-text">
        Cancelar
      </button>
    </div>
  );
}

function EditarTeste({ c, busy, onSave }: { c: Carteira; busy: boolean; onSave: (o: { dias?: number; deposito?: number }) => void }) {
  const curDays = c.endsAt ? Math.round((c.endsAt - c.createdAt) / 86_400_000) : 0;
  const [dias, setDias] = useState(curDays || 7);
  const [deposito, setDeposito] = useState(0);
  return (
    <Card className="border-info/40 p-4">
      <h2 className="text-sm font-semibold">Editar o teste</h2>
      <p className="mb-3 mt-1 text-xs text-muted">Mude a duração ou coloque mais dinheiro fictício. Para mudar uma posição, use “Editar” na linha dela.</p>
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <Lbl t="Duração total do teste">
          <select className={sel} value={dias} onChange={(e) => setDias(Number(e.target.value))}>
            {[...new Set([curDays || 7, 7, 14, 30, 90])].sort((a, b) => a - b).map((d) => (
              <option key={d} value={d}>{d} dias</option>
            ))}
          </select>
        </Lbl>
        <Lbl t="Adicionar dinheiro fictício (R$)">
          <input className={`${sel} num w-36`} inputMode="numeric" value={deposito} onChange={(e) => setDeposito(Number(e.target.value.replace(/\D/g, "")) || 0)} />
        </Lbl>
        <button type="button" disabled={busy} onClick={() => onSave({ ...(dias !== curDays ? { dias } : {}), ...(deposito > 0 ? { deposito } : {}) })} className="rounded-lg bg-info px-4 py-2 font-semibold text-black disabled:opacity-40">
          Salvar
        </button>
      </div>
    </Card>
  );
}

const REASON: Record<string, string> = { stop: "Stop", prazo: "Prazo", manual: "Manual", resolvido: "Resolvido" };

function Fechadas({ c }: { c: Carteira }) {
  const closed = c.positions.filter((p) => p.status === "fechada" && p.entryPrice).reverse();
  if (!closed.length) return null;
  const wins = closed.filter((p) => (p.pnlBRL ?? 0) > 0).length;
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold">Operações encerradas ({closed.length})</h2>
        <p className="text-xs text-muted">{wins} com lucro, {closed.length - wins} com prejuízo.</p>
      </div>
      <table className="w-full text-sm">
        <tbody className="focus-group">
          {closed.map((p) => (
            <tr key={p.id} className="focus-item border-b border-line/50">
              <td className="max-w-[18rem] truncate px-3 py-2 font-medium">{p.label}</td>
              <td className="px-2 text-xs text-muted">{REASON[p.exitReason ?? "manual"]}</td>
              <td className="num px-2 text-right text-xs text-muted">{p.closedAt ? dt(p.closedAt) : ""}</td>
              <td className={`num px-3 text-right font-semibold ${tone((p.pnlBRL ?? 0) / p.amountBRL)}`}>
                {(p.pnlBRL ?? 0) >= 0 ? "+" : ""}
                {brl(p.pnlBRL ?? 0)} ({pc((p.pnlBRL ?? 0) / p.amountBRL)})
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

const KIND: Record<CarteiraEvent["kind"], { icon: string; cls: string }> = {
  compra: { icon: "▲", cls: "text-up" },
  venda: { icon: "●", cls: "text-text" },
  stop: { icon: "▼", cls: "text-down" },
  prazo: { icon: "◷", cls: "text-info" },
  info: { icon: "•", cls: "text-muted" },
};

function Diario({ events }: { events: CarteiraEvent[] }) {
  return (
    <Card className="p-4">
      <h2 className="text-sm font-semibold">Diário da carteira</h2>
      <ul className="focus-group mt-2 max-h-72 space-y-1.5 overflow-y-auto text-sm">
        {[...events].reverse().map((e, i) => (
          <li key={`${e.t}-${i}`} className="focus-item flex gap-3">
            <span className="num w-28 shrink-0 text-xs text-muted">{dt(e.t)}</span>
            <span className={`w-3 shrink-0 ${KIND[e.kind].cls}`}>{KIND[e.kind].icon}</span>
            <span className="min-w-0">{e.text}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Aviso no navegador quando o servidor compra ou vende algo (se as notificações estiverem liberadas). */
function useNotifyEvents(events: CarteiraEvent[] | null) {
  const seen = useRef<number | null>(null);
  useEffect(() => {
    if (!events?.length) return;
    const lastT = events[events.length - 1].t;
    if (seen.current === null) {
      seen.current = lastT;
      return;
    }
    const fresh = events.filter((e) => e.t > seen.current! && e.kind !== "info");
    seen.current = lastT;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    for (const e of fresh) new Notification("Carteira de teste", { body: e.text, tag: `carteira-${e.t}` });
  }, [events]);
}

/* ----------------------------- raio-x: CDI, IR e concentração ----------------------------- */

const GROUP_COLOR: Record<string, string> = {
  Núcleo: "#199e70",
  Momento: "#3987e5",
  "Baixa volatilidade": "#c98500",
  Polymarket: "#8b5cf6",
  "Escolha manual": "#d95926",
  Caixa: "#4b5a57",
};

function groupOf(p: Position) {
  if (p.area === "polymarket") return "Polymarket";
  if (/ETF Ibovespa|ETF S&P/.test(p.sub)) return "Núcleo";
  if (p.sub.includes("momento")) return "Momento";
  if (p.sub.includes("baixa volatilidade")) return "Baixa volatilidade";
  return "Escolha manual";
}

function RaioX({ c, cdi }: { c: Carteira; cdi: { since: number; annual: number } | null }) {
  const [hover, setHover] = useState<string | null>(null);
  const total = totalValue(c);
  const ret = total / c.startCash - 1;
  const tax = estimateTax(c);
  const open = c.positions.filter((p) => p.status !== "fechada");

  const groups = new Map<string, number>();
  for (const p of open) groups.set(groupOf(p), (groups.get(groupOf(p)) ?? 0) + positionValue(p));
  if (c.cash > 0.5) groups.set("Caixa", c.cash);
  const parts = [...groups.entries()].sort((a, b) => b[1] - a[1]);
  const biggest = [...open].sort((a, b) => positionValue(b) - positionValue(a))[0];
  const biggestShare = biggest ? positionValue(biggest) / total : 0;

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <Card className="p-4">
        <div className="text-xs text-muted">Contra a renda fixa (CDI)</div>
        {cdi ? (
          <>
            <div className={`num mt-1 text-xl font-semibold ${ret - cdi.since >= 0 ? "text-up" : "text-down"}`}>
              {ret - cdi.since >= 0 ? "Ganhando" : "Perdendo"} por {pc(Math.abs(ret - cdi.since))}
            </div>
            <div className="text-xs text-muted">
              No CDI ({pc(cdi.annual, 1)} ao ano) o mesmo dinheiro teria rendido {pc(cdi.since)}, sem risco: {brl(c.startCash * (1 + cdi.since))}.
            </div>
          </>
        ) : (
          <div className="mt-1 text-sm text-muted">Sem dados do Banco Central agora.</div>
        )}
      </Card>
      <Card className="p-4">
        <div className="text-xs text-muted">Imposto de renda estimado</div>
        <div className="num mt-1 text-xl font-semibold">{brl(tax.total)}</div>
        <div className="text-xs text-muted">
          Sobre {brl(tax.gross)} de resultado já realizado. Líquido: {brl(tax.gross - tax.total)}.
        </div>
        {tax.lines.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-[11px] text-muted">
            {tax.lines.map((l) => (
              <li key={l.month + l.cls}>
                {l.month} · {TAX_LABEL[l.cls]}: {l.note}
                {l.tax > 0 ? ` (${brl(l.tax)})` : ""}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card className="p-4">
        <div className="text-xs text-muted">Onde está o dinheiro</div>
        <div className="mt-2 flex h-4 overflow-hidden rounded" onMouseLeave={() => setHover(null)}>
          {parts.map(([g, v]) => (
            <div
              key={g}
              onMouseEnter={() => setHover(g)}
              className={`focus-item h-full ${hover && hover !== g ? "dimmed" : ""}`}
              style={{ width: `${(v / total) * 100}%`, background: GROUP_COLOR[g], borderRight: "2px solid var(--color-card)" }}
              title={`${g}: ${brl(v)} (${pc(v / total, 0)})`}
            />
          ))}
        </div>
        <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
          {parts.map(([g, v]) => (
            <li
              key={g}
              onMouseEnter={() => setHover(g)}
              onMouseLeave={() => setHover(null)}
              className={`focus-item flex items-center gap-1.5 ${hover && hover !== g ? "dimmed" : ""}`}
            >
              <span className="h-2 w-2 rounded-sm" style={{ background: GROUP_COLOR[g] }} />
              <span className="text-muted">{g}</span>
              <span className="num ml-auto">{pc(v / total, 0)}</span>
            </li>
          ))}
        </ul>
        {biggest && (
          <p className={`mt-2 text-[11px] ${biggestShare > 0.25 ? "text-warn" : "text-muted"}`}>
            Maior posição: {biggest.label.slice(0, 40)} com {pc(biggestShare, 0)} do patrimônio
            {biggestShare > 0.25 ? ". Acima de 25% é concentração alta." : "."}
          </p>
        )}
      </Card>
    </div>
  );
}
