"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "@/components/Icons";
import { PERFIL_META, useConta } from "@/lib/client/conta";

const AREAS = [
  {
    key: "comecar",
    label: "Começar",
    color: "text-info",
    bar: "bg-info",
    icon: "✦",
    links: [
      { href: "/comecar", label: "Para iniciantes" },
      { href: "/carteira", label: "Carteira de teste" },
    ],
  },
  {
    key: "bolsa",
    label: "Bolsa",
    color: "text-up",
    bar: "bg-up",
    icon: "▲",
    links: [
      { href: "/bolsa/terminal", label: "Terminal" },
      { href: "/bolsa", label: "Ranking ao vivo" },
      { href: "/bolsa/config", label: "Configurações" },
    ],
  },
  {
    key: "polymarket",
    label: "Polymarket",
    color: "text-poly",
    bar: "bg-poly",
    icon: "◆",
    links: [
      { href: "/polymarket/terminal", label: "Terminal" },
      { href: "/polymarket/oportunidades", label: "Oportunidades" },
      { href: "/polymarket", label: "Ranking ao vivo" },
      { href: "/polymarket/config", label: "Configurações" },
    ],
  },
  {
    key: "analise",
    label: "Análise",
    color: "text-warn",
    bar: "bg-warn",
    icon: "◉",
    links: [{ href: "/analise", label: "Análise de mercado" }],
  },
] as const;

const MENU: ({ href: string; label: string; icon: IconName; external?: boolean } | "sep")[] = [
  { href: "/conta/perfil", label: "Perfil", icon: "user" },
  { href: "/conta/investimento", label: "Investimento e risco", icon: "sliders" },
  { href: "/conta/uso", label: "Uso", icon: "gauge" },
  { href: "/conta/idioma", label: "Idioma", icon: "globe" },
  { href: "/conta/ajuda", label: "Receber ajuda", icon: "help" },
  { href: "/conta/sobre", label: "Saiba mais", icon: "info" },
  "sep",
  { href: "/conta/conexoes", label: "Conexões e chaves de API", icon: "key" },
];

function AccountMenu() {
  const [conta] = useConta();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const path = usePathname();

  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const nome = conta.nome.trim() || "Minha conta";
  const perfil = conta.perfil ? PERFIL_META[conta.perfil].label : "Perfil não definido";

  return (
    <div ref={box} className="relative">
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 w-64 rounded-xl border border-line bg-card p-1.5 shadow-2xl md:bottom-full md:left-0 md:right-auto md:mt-0 md:mb-2"
        >
          <div className="px-3 py-2 text-xs text-muted">
            {nome} · {perfil}
          </div>
          {MENU.map((m, i) =>
            m === "sep" ? (
              <div key={`s${i}`} className="my-1 border-t border-line" />
            ) : (
              <Link
                key={m.href}
                href={m.href}
                role="menuitem"
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-card2 ${path === m.href ? "bg-card2" : ""}`}
              >
                <Icon name={m.icon} className="h-4 w-4 text-muted" />
                {m.label}
              </Link>
            ),
          )}
        </div>
      )}
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-card2 ${open || path.startsWith("/conta") ? "bg-card2" : ""}`}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-info text-xs font-bold text-black">
          {nome.charAt(0).toUpperCase()}
        </span>
        <span className="hidden min-w-0 flex-1 md:block">
          <span className="block truncate text-sm">{nome}</span>
          <span className="block truncate text-[11px] text-muted">{perfil}</span>
        </span>
        <span className="hidden text-muted md:inline">⌃</span>
      </button>
    </div>
  );
}

export function Sidebar() {
  const path = usePathname();
  const isActive = (href: string) =>
    href === "/bolsa" || href === "/polymarket"
      ? path === href || (path.startsWith(href + "/") && !path.endsWith("/config") && !path.endsWith("/terminal") && !path.endsWith("/oportunidades"))
      : path === href;

  return (
    <aside className="border-b border-line bg-card md:sticky md:top-0 md:flex md:h-screen md:w-56 md:shrink-0 md:flex-col md:border-r md:border-b-0">
      <div className="flex items-center justify-between gap-3 px-4 py-4 md:block">
        <Link href="/" className="block">
          <div className="text-sm font-semibold tracking-wide">RADAR</div>
          <div className="text-xs text-muted">Bolsa · Polymarket</div>
        </Link>
        <div className="md:hidden">
          <AccountMenu />
        </div>
      </div>
      <nav className="flex gap-2 overflow-x-auto px-3 pb-3 md:block md:flex-1 md:space-y-5 md:overflow-y-auto">
        {AREAS.map((area) => (
          <div key={area.key} className="flex shrink-0 items-center gap-1 md:block">
            <div className={`flex items-center gap-2 px-2 py-1 text-xs font-semibold uppercase tracking-wider ${area.color}`}>
              <span aria-hidden>{area.icon}</span>
              {area.label}
            </div>
            <ul className="flex gap-1 md:mt-1 md:block md:space-y-0.5">
              {area.links.map((l) => {
                const active = isActive(l.href);
                return (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className={`relative block whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition-colors ${
                        active ? "bg-card2 text-text" : "text-muted hover:bg-card2 hover:text-text"
                      }`}
                    >
                      {active && <span className={`absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded ${area.bar}`} />}
                      {l.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="hidden border-t border-line p-2 md:block">
        <AccountMenu />
      </div>
    </aside>
  );
}
