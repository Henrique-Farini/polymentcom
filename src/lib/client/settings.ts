"use client";

import {
  DEFAULT_BOLSA_SETTINGS,
  DEFAULT_POLY_SETTINGS,
  type BolsaSettings,
  type PolySettings,
} from "@/lib/score/types";
import { DEFAULT_UNIVERSE } from "@/lib/bolsa/universe";
import { useStored } from "./hooks";

export const useBolsaSettings = () => useStored<BolsaSettings>("radar:bolsa:settings", DEFAULT_BOLSA_SETTINGS, true);
export const usePolySettings = () => useStored<PolySettings>("radar:polymarket:settings", DEFAULT_POLY_SETTINGS, true);

/** Lista de ativos acompanhados na Bolsa (códigos do Yahoo). */
export const useBolsaUniverse = () =>
  useStored<string[]>("radar:bolsa:universe", DEFAULT_UNIVERSE.map((u) => u.symbol));
