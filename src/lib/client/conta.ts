"use client";

import { useStored } from "./hooks";

import type { Perfil } from "@/lib/perfil";
export { PERFIL_META, RISK_STYLE, riskLevel, type Perfil, type RiskLevel } from "@/lib/perfil";

export interface Conta {
  nome: string;
  perfil: Perfil | null;
  /** Valor padrão das simulações, em R$. */
  valor: number;
  /** Prazo padrão, em pregões. */
  dias: number;
  /** Stop padrão (0.08 = sair se cair 8%). 0 = sem stop. */
  stop: number;
  /** Limites para a futura automação. */
  maxPorOperacao: number;
  perdaMaxDia: number;
  corretora: string;
  idioma: "pt-BR" | "en" | "es";
}

export const DEFAULT_CONTA: Conta = {
  nome: "",
  perfil: null,
  valor: 1000,
  dias: 20,
  stop: 0.08,
  maxPorOperacao: 500,
  perdaMaxDia: 100,
  corretora: "",
  idioma: "pt-BR",
};

export const useConta = () => useStored<Conta>("radar:conta", DEFAULT_CONTA, true);

/* ------------- contadores de uso (só neste navegador) ------------- */

export interface Uso {
  ia: number;
  simulacoes: number;
  desde: number;
}

const USO_KEY = "radar:uso";

export function readUso(): Uso {
  try {
    const raw = window.localStorage.getItem(USO_KEY);
    if (raw) return JSON.parse(raw) as Uso;
  } catch {
    /* sem armazenamento */
  }
  return { ia: 0, simulacoes: 0, desde: Date.now() };
}

export function bumpUso(key: "ia" | "simulacoes") {
  try {
    const u = readUso();
    u[key]++;
    window.localStorage.setItem(USO_KEY, JSON.stringify(u));
  } catch {
    /* sem armazenamento */
  }
}
