"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Simulador } from "@/components/comecar/Simulador";
import { PerfilQuiz } from "@/components/PerfilQuiz";
import { Termo } from "@/components/Termo";
import { Card } from "@/components/ui";
import type { BolsaAnalysis, PolyAnalysis } from "@/lib/analise/types";
import type { BolsaAsset } from "@/lib/bolsa/types";
import { CORE_ETFS, DEFAULT_UNIVERSE, MOMENTUM_UNIVERSE, displaySymbol } from "@/lib/bolsa/universe";
import { PERFIL_META, RISK_STYLE, riskLevel, useConta, type Perfil } from "@/lib/client/conta";
import { usePolling } from "@/lib/client/hooks";
import { useBolsaSettings, useBolsaUniverse, usePolySettings } from "@/lib/client/settings";
import type { AssetStats } from "@/lib/analise/types";
import { pickBolsa, pickPoly, pickRegraNova } from "@/lib/picks";
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

  // Regra nova: as mesmas estatísticas que a carteira automática usa (ações da B3, BDRs e ETFs, com dividendos).
  const regraSymbols = encodeURIComponent([...MOMENTUM_UNIVERSE, ...CORE_ETFS].join(","));
  const regraStats = usePolling<BolsaAnalysis>(`/api/analise/bolsa?symbols=${regraSymbols}`, 30 * 60_000);
  const regra = useMemo(
    () => (regraStats.data ? pickRegraNova(regraStats.data.assets, MOMENTUM_UNIVERSE, CORE_ETFS, 4) : null),
    [regraStats.data],
  );

  // Alertas de agora (o que evitar) continuam vindo do score ao vivo.
  const picks = useMemo(
    () => (live.data ? pickBolsa(live.data.assets, stats.data?.assets ?? null, perfil, bSettings) : null),
    [live.data, stats.data, perfil, bSettings],
  );

  const polyPicks = useMemo(() => (poly.data ? pickPoly(poly.data.markets, pSettings) : []), [poly.data, pSettings]);

  /* simulador */
  const options = useMemo(() => {
    const names = new Map(live.data?.assets.map((a) => [a.symbol, a]) ?? []);
    const fromRegra = regra ? [...regra.core, ...regra.momentum.map((m) => m.s), ...regra.lowVol] : [];
    const list = [
      ...fromRegra.map((s) => ({ symbol: s.symbol, display: displaySymbol(s.symbol), name: s.name })),
      ...universe.map((s) => {
        const a = names.get(s);
        const u = DEFAULT_UNIVERSE.find((x) => x.symbol === s);
        return { symbol: s, display: a?.display ?? s.replace(".SA", ""), name: a?.name ?? u?.name ?? s };
      }),
    ];
    return list.filter((x, i) => list.findIndex((y) => y.symbol === x.symbol) === i);
  }, [universe, live.data, regra]);
  const [simSymbol, setSimSymbol] = useState("");
  const simRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Começa pelo ativo mais forte do perfil (espera as cotações chegarem).
    if (!simSymbol && regra) setSimSymbol(regra.momentum[0]?.s.symbol ?? options[0]?.symbol ?? "");
  }, [regra, options, simSymbol]);
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
            <span className="text-up">▲</span> Bolsa: onde a regra testada colocaria o dinheiro agora
          </h2>
          <Link href="/analise?aba=estrategias" className="text-sm text-up hover:underline">Ver o teste de 16 anos →</Link>
        </div>
        <p className="mb-3 text-sm text-muted">
          Um terço em cada parte, revisando uma vez por mês. Foi a regra mais equilibrada quando testamos 16 anos de dados (sem <Termo k="stop" />, que piorou o resultado em
          todos os testes). Tudo comprável numa corretora brasileira: ações americanas entram como BDR.
          {perfil === "conservador" && " Para o perfil conservador, o núcleo sozinho já é um bom começo."}
        </p>
        {!regra ? (
          <p className="text-sm text-muted">Calculando com o histórico de mais de 80 ativos… (na primeira vez leva alguns segundos)</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            {[
              { t: "Núcleo", d: "O mercado inteiro: Brasil e EUA. A base que segura as quedas.", items: regra.core.map((s) => ({ s, why: s.symbol.startsWith("BOVA") ? "As maiores empresas do Brasil" : "As 500 maiores dos EUA, em reais" })) },
              { t: "Momento", d: "As que mais subiram em 12 meses (sem contar o último mês). Tendem a continuar, mas oscilam mais.", items: regra.momentum.map((m) => ({ s: m.s, why: `Subiu ${pc(m.mom)} em 12 meses` })) },
              { t: "Baixa volatilidade", d: "As que menos oscilaram no último ano. Rendem com menos susto.", items: regra.lowVol.map((s) => ({ s, why: `Oscila ${Math.round((s.vol1y ?? 0) * 100)}% ao ano` })) },
            ].map((g) => (
              <div key={g.t}>
                <div className="mb-2">
                  <h3 className="font-semibold">{g.t} <span className="text-xs font-normal text-muted">· 1/3 do dinheiro</span></h3>
                  <p className="text-xs text-muted">{g.d}</p>
                </div>
                <div className="focus-group space-y-2">
                  {g.items.map(({ s, why }) => (
                    <RegraCard key={g.t + s.symbol} s={s} why={why} valor={conta.valor || 1000} onSimular={() => simular(s.symbol)} />
                  ))}
                </div>
              </div>
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

function RegraCard({ s, why, valor, onSimular }: { s: AssetStats; why: string; valor: number; onSimular: () => void }) {
  const risk = riskLevel(s.vol1y);
  return (
    <Card className="focus-item p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/bolsa/ativo/${encodeURIComponent(s.symbol)}`} className="num font-bold hover:underline">{displaySymbol(s.symbol)}</Link>
          <span className="ml-2 text-xs text-muted">{s.name}</span>
          <div className="text-xs text-text/80">{why}</div>
        </div>
        {risk && <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ring-1 ${RISK_STYLE[risk]}`}>Risco {risk.toLowerCase()}</span>}
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 text-xs">
        {s.ret1y != null && (
          <div>
            <dt className="text-muted">{brl(valor)} há 1 ano</dt>
            <dd className={`num font-semibold ${s.ret1y >= 0 ? "text-up" : "text-down"}`}>{brl(valor * (1 + s.ret1y))}</dd>
          </div>
        )}
        {s.mdd1y != null && (
          <div>
            <dt className="text-muted"><Termo k="piorQueda" /> no ano</dt>
            <dd className="num text-down">{pc(s.mdd1y)}</dd>
          </div>
        )}
      </dl>
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="num text-muted">1 ação: {brl(s.price)}</span>
        <button type="button" onClick={onSimular} className="font-medium text-info hover:underline">Simular →</button>
      </div>
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
