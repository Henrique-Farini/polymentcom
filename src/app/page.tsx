import Link from "next/link";

export default function Home() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 py-6">
      <div>
        <h1 className="text-2xl font-semibold">Radar de Mercado</h1>
        <p className="mt-1 text-sm text-muted">
          Duas áreas separadas, cada uma com seu ranking ao vivo, filtros, favoritos, avisos e configurações.
        </p>
      </div>
      <Link href="/comecar" className="group flex items-center justify-between gap-4 rounded-xl border border-info/40 bg-info/5 p-5 transition-colors hover:border-info">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-info">✦ Novo por aqui?</div>
          <h2 className="mt-1 text-lg font-semibold">Comece por aqui</h2>
          <p className="mt-1 text-sm text-muted">
            3 perguntas sobre você, os investimentos e apostas mais fortes agora em linguagem simples, e um simulador de prazo e stop.
          </p>
        </div>
        <span className="shrink-0 text-sm text-info group-hover:underline">Abrir →</span>
      </Link>
      <div className="focus-group grid gap-4 md:grid-cols-2">
        <Link href="/bolsa/terminal" className="group rounded-xl border border-line bg-card p-6 transition-colors hover:border-up/60">
          <div className="text-3xl text-up">▲</div>
          <h2 className="mt-2 text-lg font-semibold">Bolsa</h2>
          <p className="mt-1 text-sm text-muted">
            Ações da B3 e dos EUA, índices, dólar e cripto. Score por tendência, momento, volume e volatilidade.
          </p>
          <span className="mt-4 inline-block text-sm text-up group-hover:underline">Abrir terminal →</span>
        </Link>
        <Link href="/polymarket/terminal" className="group rounded-xl border border-line bg-card p-6 transition-colors hover:border-poly/60">
          <div className="text-3xl text-poly">◆</div>
          <h2 className="mt-2 text-lg font-semibold">Polymarket</h2>
          <p className="mt-1 text-sm text-muted">
            Mercados de previsão mais negociados. Score por movimento da probabilidade, volume, liquidez, spread e prazo.
          </p>
          <span className="mt-4 inline-block text-sm text-poly group-hover:underline">Abrir terminal →</span>
        </Link>
      </div>
    </div>
  );
}
