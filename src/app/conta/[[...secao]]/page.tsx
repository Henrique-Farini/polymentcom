"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Icon } from "@/components/Icons";
import {
  AjudaSecao,
  ConexoesSecao,
  IdiomaSecao,
  InvestimentoSecao,
  NotificacoesSecao,
  PerfilSecao,
  SECOES,
  SobreSecao,
  UsoSecao,
} from "@/components/conta/Secoes";

const VIEWS: Record<string, () => React.ReactNode> = {
  perfil: PerfilSecao,
  investimento: InvestimentoSecao,
  conexoes: ConexoesSecao,
  idioma: IdiomaSecao,
  notificacoes: NotificacoesSecao,
  uso: UsoSecao,
  ajuda: AjudaSecao,
  sobre: SobreSecao,
};

export default function ContaPage() {
  const params = useParams<{ secao?: string[] }>();
  const slug = params.secao?.[0] && VIEWS[params.secao[0]] ? params.secao[0] : "perfil";
  const View = VIEWS[slug];
  return (
    <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-[13rem_1fr]">
      <nav aria-label="Seções da conta" className="md:sticky md:top-5 md:self-start">
        <div className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-muted">Conta</div>
        <ul className="flex gap-1 overflow-x-auto md:block md:space-y-0.5">
          {SECOES.map((s) => (
            <li key={s.slug}>
              <Link
                href={`/conta/${s.slug}`}
                className={`flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors ${
                  s.slug === slug ? "bg-card2 text-text" : "text-muted hover:bg-card2 hover:text-text"
                }`}
              >
                <Icon name={s.icon} />
                {s.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0">
        <View />
      </div>
    </div>
  );
}
