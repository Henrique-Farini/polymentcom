"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type LiveStatus = "carregando" | "ao vivo" | "atrasado" | "offline";

export interface PollState<T> {
  data: T | null;
  status: LiveStatus;
  /** Quando o servidor buscou o dado na fonte (ms). */
  updatedAt: number | null;
  error: string | null;
  refresh: () => void;
}

/**
 * Busca `url` a cada `intervalMs`. Mantém o último dado bom quando a rede falha.
 * Pausa quando a aba fica escondida e atualiza na hora quando ela volta.
 */
export function usePolling<T extends { at?: number; stale?: boolean }>(
  url: string | null,
  intervalMs: number,
): PollState<T> {
  const [data, setData] = useState<T | null>(null);
  const [status, setStatus] = useState<LiveStatus>("carregando");
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const hasData = useRef(false);
  const urlRef = useRef(url);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (urlRef.current !== url) {
      urlRef.current = url;
      hasData.current = false;
      setData(null);
      setStatus("carregando");
    }
    if (!url) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ctrl = new AbortController();

    async function load() {
      if (document.hidden) {
        timer = setTimeout(load, intervalMs);
        return;
      }
      try {
        const res = await fetch(url!, { cache: "no-store", signal: ctrl.signal });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
        hasData.current = true;
        setData(json);
        setUpdatedAt(json.at ?? Date.now());
        setStatus(json.stale ? "atrasado" : "ao vivo");
        setError(json.stale ? json.error ?? "Fonte instável; mostrando último dado" : null);
      } catch (e) {
        if (cancelled || (e instanceof DOMException && e.name === "AbortError")) return;
        setError(e instanceof Error ? e.message : String(e));
        setStatus(hasData.current ? "atrasado" : "offline");
      }
      if (!cancelled) timer = setTimeout(load, intervalMs);
    }

    const onVisible = () => {
      if (!document.hidden) {
        clearTimeout(timer);
        load();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    load();
    return () => {
      cancelled = true;
      ctrl.abort();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [url, intervalMs, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { data, status, updatedAt, error, refresh };
}

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function readStorageRaw<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

const SYNC_EVENT = "radar:storage";

/** Estado salvo no navegador. `merge` junta objetos com o padrão (útil para configurações). */
export function useStored<T>(key: string, fallback: T, merge = false): [T, (v: T | ((p: T) => T)) => void, boolean] {
  const [value, setValue] = useState<T>(fallback);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const load = () => setValue(merge ? readStorage(key, fallback) : readStorageRaw(key, fallback));
    load();
    setReady(true);
    // Outros componentes (ou outras abas) que usam a mesma chave ficam em dia.
    const onLocal = (e: Event) => (e as CustomEvent<string>).detail === key && load();
    const onOther = (e: StorageEvent) => e.key === key && load();
    window.addEventListener(SYNC_EVENT, onLocal);
    window.addEventListener("storage", onOther);
    return () => {
      window.removeEventListener(SYNC_EVENT, onLocal);
      window.removeEventListener("storage", onOther);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const set = useCallback(
    (v: T | ((p: T) => T)) => {
      setValue((prev) => {
        const next = typeof v === "function" ? (v as (p: T) => T)(prev) : v;
        try {
          window.localStorage.setItem(key, JSON.stringify(next));
          // Avisa depois da renderização atual, para não atualizar outro componente no meio dela.
          queueMicrotask(() => window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: key })));
        } catch {
          /* armazenamento indisponível: segue só em memória */
        }
        return next;
      });
    },
    [key],
  );

  return [value, set, ready];
}

export function useWatchlist(area: "bolsa" | "polymarket") {
  const [list, setList] = useStored<string[]>(`radar:${area}:watchlist`, []);
  const toggle = useCallback(
    (id: string) => setList((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id])),
    [setList],
  );
  return { list, has: (id: string) => list.includes(id), toggle };
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
