"use client";

import { useEffect, useRef } from "react";
import type { SignalStatus } from "@/lib/score/types";
import { useStored } from "./hooks";

export interface Transition {
  id: string;
  label: string;
  from: SignalStatus;
  to: SignalStatus;
  at: number;
  detail: string;
}

export interface AlertPrefs {
  notify: boolean;
  /** Avisar só quando o score de destaque for pelo menos este valor. */
  minScore: number;
  /** Avisar só sobre favoritos. */
  onlyWatchlist: boolean;
}

export const DEFAULT_ALERT_PREFS: AlertPrefs = { notify: false, minScore: 75, onlyWatchlist: false };

export const STATUS_LABEL: Record<SignalStatus, string> = {
  destaque: "Em destaque",
  neutro: "Neutro",
  alerta: "Em alerta",
};

interface Item {
  id: string;
  label: string;
  status: SignalStatus;
  score: number;
  detail: string;
}

/**
 * Compara a classificação atual com a anterior e registra quem mudou de lista.
 * A primeira leitura só grava o estado inicial (sem disparar avisos).
 */
export function useTransitions(area: "bolsa" | "polymarket", items: Item[] | null, watchlist: string[]) {
  const [history, setHistory] = useStored<Transition[]>(`radar:${area}:history`, []);
  const [prefs, setPrefs] = useStored<AlertPrefs>(`radar:${area}:alerts`, DEFAULT_ALERT_PREFS, true);
  const prev = useRef<Map<string, SignalStatus> | null>(null);

  useEffect(() => {
    if (!items) return;
    const current = new Map(items.map((i) => [i.id, i.status]));
    if (prev.current) {
      const changes: Transition[] = [];
      for (const i of items) {
        const before = prev.current.get(i.id);
        if (before && before !== i.status) {
          changes.push({ id: i.id, label: i.label, from: before, to: i.status, at: Date.now(), detail: i.detail });
        }
      }
      if (changes.length) {
        setHistory((h) => [...changes, ...h].slice(0, 200));
        if (prefs.notify && typeof Notification !== "undefined" && Notification.permission === "granted") {
          for (const c of changes) {
            if (prefs.onlyWatchlist && !watchlist.includes(c.id)) continue;
            const item = items.find((i) => i.id === c.id);
            const relevant = c.to === "alerta" || (c.to === "destaque" && (item?.score ?? 0) >= prefs.minScore);
            if (!relevant) continue;
            new Notification(`${c.label} → ${STATUS_LABEL[c.to]}`, { body: c.detail, tag: `${area}:${c.id}` });
          }
        }
      }
    }
    prev.current = current;
  }, [items, area, prefs, watchlist, setHistory]);

  return { history, clearHistory: () => setHistory([]), prefs, setPrefs };
}
