"use client";

import { GLOSSARIO, type TermoKey } from "@/lib/glossario";

/** Palavra com explicação simples ao passar o mouse (ou focar com o teclado). */
export function Termo({ k, children }: { k: TermoKey; children?: React.ReactNode }) {
  const g = GLOSSARIO[k];
  return (
    <span className="group/termo relative inline-block">
      <span tabIndex={0} className="cursor-help border-b border-dotted border-muted/70 outline-none focus-visible:text-info">
        {children ?? g.termo}
      </span>
      <span
        role="tooltip"
        className="pointer-events-none invisible absolute bottom-full left-1/2 z-30 mb-1.5 w-64 -translate-x-1/2 rounded-lg border border-line bg-bg px-3 py-2 text-left text-xs font-normal normal-case tracking-normal text-text opacity-0 shadow-xl transition-opacity group-hover/termo:visible group-hover/termo:opacity-100 group-focus-within/termo:visible group-focus-within/termo:opacity-100"
      >
        <b className="text-info">{g.termo}:</b> {g.def}
      </span>
    </span>
  );
}
