import "server-only";

interface Entry {
  value?: unknown;
  at: number;
  pending?: Promise<unknown>;
}

// Guardado no globalThis para sobreviver ao hot reload do `next dev`.
const g = globalThis as unknown as { __radarCache?: Map<string, Entry> };
const store = (g.__radarCache ??= new Map());

export interface Cached<T> {
  value: T;
  /** Quando o dado foi buscado na fonte (ms). */
  at: number;
  /** true quando a fonte falhou e estamos devolvendo o último dado conhecido. */
  stale: boolean;
  error?: string;
}

/**
 * Cache em memória com TTL. Chamadas simultâneas compartilham a mesma busca.
 * Se a fonte falhar e houver dado antigo, devolve o antigo marcado como `stale`.
 */
export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<Cached<T>> {
  const entry = store.get(key);
  const now = Date.now();
  if (entry && entry.value !== undefined && now - entry.at < ttlMs) {
    return { value: entry.value as T, at: entry.at, stale: false };
  }

  let pending = entry?.pending as Promise<T> | undefined;
  if (!pending) {
    pending = fn();
    store.set(key, { value: entry?.value, at: entry?.at ?? 0, pending });
  }

  try {
    const value = await pending;
    const current = store.get(key);
    if (current?.pending === pending) store.set(key, { value, at: Date.now() });
    return { value, at: store.get(key)?.at ?? Date.now(), stale: false };
  } catch (err) {
    const current = store.get(key);
    if (current?.pending === pending) store.set(key, { value: current.value, at: current.at });
    const message = err instanceof Error ? err.message : String(err);
    if (entry?.value !== undefined) {
      return { value: entry.value as T, at: entry.at, stale: true, error: message };
    }
    throw err;
  }
}
