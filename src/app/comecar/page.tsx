"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Simulador } from "@/components/comecar/Simulador";
import { PerfilQuiz } from "@/components/PerfilQuiz";
import { Termo } from "@/components/Termo";
import { Card } from "@/components/ui";
import type { BolsaAnalysis, PolyAnalysis } from "@/lib/analise/types";
import type { BolsaAsset } from "@/lib/bolsa/types";
import { DEFAULT_UNIVERSE } from "@/lib/bolsa/universe";
import { PERFIL_META, RISK_STYLE, riskLevel, useConta, type Perfil } from "@/lib/client/conta";
import { usePolling } from "@/lib/client/hooks";
import { useBolsaSettings, useBolsaUniverse, usePolySettings } from "@/lib/client/settings";
import { pickBolsa, pickPoly, type BolsaPick as Pick } from "@/lib/picks";
import { hoursToEnd } from "@/lib/score/polymarket";
import type { ScoreResult } from "@/lib/score/types";
import type { PolyMarket } from "@/lib/polymarket/types";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const pc = (x: number | null, d = 0) => (x === null ? "–" : `${x > 0 ? "+" : ""}${(x * 100).toFixed(d)}%`);

const MARKET_TXT: Record<string, string> = {
  B3: "Ação brasileira",
  EUA: "Ação americana (em dólar)",
  Índices: "Índice (cesta de ações)",
  "Cripto/Câmbio": "Cripto ou moeda",
};

/** Os motivos do score em linguagem simples. */
const PLAIN: Record<string, string> = {
  tendencia: "Vem subindo: o preço está acima da média dos últimos dias",
  momento: "Ganhando força, sem ter subido rápido demais",
  volume: "Mais gente negociando que o normal",
  volatilidade: "Subindo de forma estável, sem exageros",
  dia: "Em alta hoje",
};

function plainReasons(s: ScoreResult) {
  return [...s.components]
    .filter((c) => c.value >= 0.6 && c.weight > 0 && PLAIN[c.key])
    .sort((a, b) => b.points - a.points)
    .slice(0, 2)
    .map((c) => PLAIN[c.key]);
}

function plainAlert(a: string) {
  if (a.startsWith("RSI")) return "Caindo rápido e perdendo força";
  if (a.startsWith("Perdeu a média")) return "Abaixo da média de longo prazo e ainda caindo";
  if (a.startsWith("Queda com volume")) return "Muita gente vendendo ao mesmo tempo";
  if (a.startsWith("Score baixo")) return "Sinais fracos no geral";
  return a;
}

const forca = (score: number) => (score >= 75 ? "Muito forte" : score >= 65 ? "Forte" : score >= 50 ? "Média" : "Fraca");

export default function ComecarPage() {
  const [conta, setConta, contaReady] = useConta();
  const [universe, , ready] = useBolsaUniverse();
  const [bSettings] = useBolsaSettings();
  const [pSettings] = usePolySettings();
  const [quiz, setQuiz] = useState(false);
  const perfil: Perfil = conta.perfil ?? "moderado";

  const symbols = ready ? encodeURIComponent(universe.join(",")) : null;
  const live = usePolling<{ assets: BolsaAsset[]; at: number }>(symbols ? `/api/bolsa/assets?symbols=${symbols}` : null, 30_000);
  const stats = usePolling<BolsaAnalysis>(symbols ? `/api/analise/bolsa?symbols=${symbols}` : null, 30 * 60_000);
  const poly = usePolling<{ markets: PolyMarket[]; at: number }>("/api/polymarket/markets", 30_000);
  const calib = usePolling<PolyAnalysis>("/api/analise/polymarket", 60 * 60_000);

  const picks = useMemo(
    () => (live.data ? pickBolsa(live.data.assets, stats.data?.assets ?? null, perfil, bSettings) : null),
    [live.data, stats.data, perfil, bSettings],
  );

  const polyPicks = useMemo(() => (poly.data ? pickPoly(poly.data.markets, pSettings) : []), [poly.data, pSettings]);

  /* simulador */
  const options = useMemo(() => {
    const names = new Map(live.data?.assets.map((a) => [a.symbol, a]) ?? []);
    return universe.map((s) => {
      const a = names.get(s);
      const u = DEFAULT_UNIVERSE.find((x) => x.symbol === s);
      return { symbol: s, display: a?.display ?? s.replace(".SA", ""), name: a?.name ?? u?.name ?? s };
    });
  }, [universe, live.data]);
  const [simSymbol, setSimSymbol] = useState("");
  const simRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Começa pelo ativo mais forte do perfil (espera as cotações chegarem).
    if (!simSymbol && picks) setSimSymbol(picks.best[0]?.a.symbol ?? options[0]?.symbol ?? "");
  }, [picks, options, simSymbol]);
  const simular = (s: string) => {
    setSimSymbol(s);
    simRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const showQuiz = contaReady && (!conta.perfil || quiz);
  const meta = PERFIL_META[perfil];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Cabeçalho */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">
            {conta.nome ? `Olá, ${conta.nome.split(" ")[0]}. ` : ""}Comece por aqui
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            O resumo do que os números mostram agora, em linguagem simples. Passe o mouse nas palavras sublinhadas para ver o que significam.
          </p>
        </div>
        {conta.perfil && !quiz && (
          <button type="button" onClick={() => setQuiz(true)} className="rounded-lg border border-line px-3 py-1.5 text-sm hover:border-info">
            Perfil: <b className={meta.color}>{meta.label}</b> · mudar
          </button>
        )}
      </header>

      {showQuiz && (
        <Card className="border-info/40 p-5">
          <h2 className="text-base font-semibold">Primeiro, 3 perguntas sobre você</h2>
          <p className="mb-4 mt-1 text-sm text-muted">Assim mostramos só o que combina com o risco que você aceita.{!conta.perfil && " Até responder, usamos o perfil Moderado."}</p>
          <PerfilQuiz
            onDone={(p) => {
              setConta({ ...conta, perfil: p });
              setQuiz(false);
            }}
          />
        </Card>
      )}

      {/* Como funciona */}
      <section className="grid gap-3 md:grid-cols-3">
        {[
          { n: "1", t: "Escolha", d: "Veja abaixo os ativos e apostas mais fortes agora para o seu perfil, e o que evitar." },
          { n: "2", t: "Simule", d: "Teste no passado: quanto tempo deixar investido e em quanto de queda sair (stop)." },
          { n: "3", t: "Invista e acompanhe", d: "Compre pela sua corretora ou no Polymarket e acompanhe aqui. O app avisa se a situação mudar." },
        ].map((x) => (
          <Card key={x.n} className="flex gap-3 p-4">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-info/15 text-sm font-bold text-info">{x.n}</span>
            <div>
              <div className="font-semibold">{x.t}</div>
              <p className="text-sm text-muted">{x.d}</p>
            </div>
          </Card>
        ))}
      </section>

      {/* Bolsa */}
      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">
            <span className="text-up">▲</span> Bolsa: os mais fortes agora para o perfil {meta.label.toLowerCase()}
          </h2>
          <Link href="/bolsa/terminal" className="text-sm text-up hover:underline">Ver todos no Terminal →</Link>
        </div>
        <p className="mb-3 text-sm text-muted">
          Escolhidos pelo <Termo k="score" /> de agora e pelo retorno em relação ao risco no último ano.{" "}
          {perfil !== "arrojado" && <>Ficam de fora ativos com <Termo k="volatilidade" /> acima de {Math.round(meta.maxVol * 100)}% ao ano.</>}
        </p>
        {!picks ? (
          <p className="text-sm text-muted">Carregando cotações…</p>
        ) : picks.best.length === 0 ? (
          <Card className="p-4 text-sm text-muted">Nenhum ativo do seu perfil está com sinais bons agora. Às vezes a melhor decisão é esperar.</Card>
        ) : (
          <div className="focus-group grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {picks.best.map((p) => (
              <BolsaCard key={p.a.symbol} p={p} valor={conta.valor || 1000} onSimular={() => simular(p.a.symbol)} />
            ))}
          </div>
        )}

        {picks && picks.avoid.length > 0 && (
          <Card className="mt-3 p-4">
            <h3 className="text-sm font-semibold text-down">▼ Evite por enquanto (em alerta)</h3>
            <ul className="focus-group mt-2 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
              {picks.avoid.map((p) => (
                <li key={p.a.symbol} className="focus-item text-sm">
                  <div className="flex items-baseline gap-2">
                    <Link href={`/bolsa/ativo/${encodeURIComponent(p.a.symbol)}`} className="num font-semibold hover:underline">{p.a.display}</Link>
                    <span className="num whitespace-nowrap text-down">{pc(p.a.changePct / 100, 1)} hoje</span>
                  </div>
                  <span className="block text-xs text-muted">{p.s.alerts.length ? plainAlert(p.s.alerts[p.a.changePct <= -4 && p.s.alerts.length > 1 ? 1 : 0]) : "Sinais fracos"}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      {/* Simulador */}
      <section ref={simRef} className="scroll-mt-4">
        {simSymbol && (
          <Simulador
            options={options}
            symbol={simSymbol}
            onSymbol={setSimSymbol}
            valor={conta.valor || 1000}
            onValor={(v) => setConta({ ...conta, valor: v })}
            days={conta.dias}
            onDays={(d) => setConta({ ...conta, dias: d })}
            stop={conta.stop || null}
            onStop={(s) => setConta({ ...conta, stop: s ?? 0 })}
          />
        )}
      </section>

      {/* Polymarket */}
      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">
            <span className="text-poly">◆</span> Polymarket: as apostas mais movimentadas e firmes
          </h2>
          <Link href="/polymarket/terminal" className="text-sm text-poly hover:underline">Ver todas no Terminal →</Link>
        </div>
        <Card className="mb-3 p-4 text-sm text-muted">
          <b className="text-text">Como funciona:</b> cada pergunta tem um preço de 0 a 1 dólar, que é a <Termo k="probabilidade">chance</Termo> que as pessoas dão para ela acontecer.
          Comprar “Sim” a 60¢ e acontecer: cada cota vira $1 (lucro de 67%). Não acontecer: perde o que pagou.
          {calib.data && (
            <>
              {" "}Nos {calib.data.markets} últimos mercados encerrados, os preços acertaram bem ({Math.round((1 - calib.data.brier / 0.25) * 100)}% melhor que um chute), então não espere achar “aposta barata” com facilidade.
            </>
          )}
          {perfil === "conservador" && (
            <span className="mt-2 block text-warn">
              Para o perfil conservador, trate o Polymarket como aposta: use só um valor pequeno que você aceita perder inteiro.
            </span>
          )}
        </Card>
        {!poly.data ? (
          <p className="text-sm text-muted">Carregando mercados…</p>
        ) : (
          <div className="focus-group grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {polyPicks.map(({ m, s }) => (
              <PolyCard key={m.id} m={m} s={s} />
            ))}
          </div>
        )}
      </section>

      {/* Próximos passos */}
      <Card className="grid gap-4 p-5 md:grid-cols-3">
        <div>
          <h3 className="font-semibold">Ainda não tem corretora?</h3>
          <p className="mt-1 text-sm text-muted">
            Para comprar ações você precisa de uma conta numa <Termo k="corretora" />. Muitas não cobram taxa para ações. Dá para começar com pouco: algumas ações custam menos de R$ 20.
          </p>
        </div>
        <div>
          <h3 className="font-semibold">Regras de ouro</h3>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm text-muted">
            <li>Não invista dinheiro que vai precisar logo.</li>
            <li><Termo k="diversificar">Diversifique</Termo>: nunca tudo num lugar só.</li>
            <li>Defina antes quando vai sair (prazo e stop).</li>
          </ul>
        </div>
        <div>
          <h3 className="font-semibold">Quer entender mais?</h3>
          <p className="mt-1 text-sm text-muted">
            Veja o <Link href="/conta/ajuda" className="text-info hover:underline">glossário e as perguntas frequentes</Link>, ou a{" "}
            <Link href="/analise" className="text-info hover:underline">Análise de mercado</Link> com as estatísticas completas.
          </p>
        </div>
      </Card>

      <p className="text-xs text-muted">
        Isto é um resumo automático de estatísticas e sinais técnicos, não recomendação de investimento. Investimentos podem perder valor; apostas podem ser perdidas inteiras.
      </p>
    </div>
  );
}

function BolsaCard({ p, valor, onSimular }: { p: Pick; valor: number; onSimular: () => void }) {
  const risk = riskLevel(p.st?.vol1y ?? null);
  return (
    <Card className="focus-item flex flex-col p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/bolsa/ativo/${encodeURIComponent(p.a.symbol)}`} className="num text-lg font-bold hover:underline">{p.a.display}</Link>
          <div className="truncate text-sm">{p.a.name}</div>
          <div className="text-xs text-muted">{MARKET_TXT[p.a.market]}</div>
        </div>
        {risk && <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ring-1 ${RISK_STYLE[risk]}`}>Risco {risk.toLowerCase()}</span>}
      </div>

      <div className="mt-3">
        <div className="flex justify-between text-xs">
          <span className="text-muted">Força agora</span>
          <span className="font-medium">{forca(p.s.score)} ({p.s.score})</span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded bg-card2">
          <div className="h-full bg-up" style={{ width: `${p.s.score}%` }} />
        </div>
      </div>

      <dl className="mt-3 space-y-1 text-sm">
        {p.st?.ret1y != null && (
          <div className="flex justify-between gap-2">
            <dt className="text-muted">{brl(valor)} há 1 ano viraram</dt>
            <dd className={`num font-semibold ${p.st.ret1y >= 0 ? "text-up" : "text-down"}`}>{brl(valor * (1 + p.st.ret1y))}</dd>
          </div>
        )}
        {p.st?.mdd1y != null && (
          <div className="flex justify-between gap-2">
            <dt className="text-muted"><Termo k="piorQueda" /> no ano</dt>
            <dd className="num text-down">{pc(p.st.mdd1y)}</dd>
          </div>
        )}
      </dl>

      {plainReasons(p.s).length > 0 && (
        <ul className="mt-3 space-y-0.5 text-xs text-muted">
          {plainReasons(p.s).map((r) => (
            <li key={r}>✓ {r}</li>
          ))}
        </ul>
      )}

      <button type="button" onClick={onSimular} className="mt-auto pt-3 text-left text-sm font-medium text-info hover:underline">
        Simular prazo e stop →
      </button>
    </Card>
  );
}

const SIM: Record<string, string> = { Yes: "Sim", No: "Não" };

function PolyCard({ m, s }: { m: PolyMarket; s: ScoreResult }) {
  const name = SIM[m.outcomes[0]] ?? m.outcomes[0] ?? "Sim";
  const price = m.bestAsk ?? m.probability;
  const h = hoursToEnd(m);
  const prazo = h === null ? null : h < 1.5 ? "cerca de 1 hora" : h < 48 ? `${Math.round(h)} horas` : `${Math.round(h / 24)} dias`;
  const liq = m.liquidity >= 100_000 ? "alta" : m.liquidity >= 20_000 ? "boa" : "baixa";
  return (
    <Card className="focus-item flex flex-col p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted">{m.category}</div>
      <Link href={`/polymarket/mercado/${m.id}`} className="mt-1 line-clamp-3 text-sm font-semibold hover:underline">{m.question}</Link>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="num text-2xl font-bold text-poly">{Math.round(m.probability * 100)}%</span>
        <span className="text-xs text-muted">de chance de “{name}”, segundo o mercado</span>
      </div>
      <p className="mt-2 text-sm text-muted">
        Apostando <b className="text-text">R$ 100</b> em “{name}”: recebe <b className="text-up">{brl(100 / price)}</b> se acontecer; perde os R$ 100 se não.
      </p>
      <div className="mt-auto flex flex-wrap gap-x-3 gap-y-1 pt-3 text-xs text-muted">
        {prazo && <span>Encerra em {prazo}</span>}
        <span><Termo k="liquidez">Liquidez</Termo> {liq}</span>
        <span>Força {forca(s.score).toLowerCase()} ({s.score})</span>
      </div>
    </Card>
  );
}
