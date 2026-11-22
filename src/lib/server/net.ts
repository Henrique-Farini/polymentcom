import "server-only";
import dns from "node:dns";
import type { LookupFunction } from "node:net";
import { Agent, fetch as undiciFetch } from "undici";

/**
 * Algumas operadoras no Brasil recusam os endereços do Polymarket no DNS delas.
 * Para as chamadas marcadas com `publicDns`, o servidor resolve o nome usando
 * DNS públicos (Cloudflare/Google). O resto do tráfego usa o DNS normal.
 */
const resolver = new dns.Resolver({ timeout: 4000, tries: 2 });
resolver.setServers(
  (process.env.PUBLIC_DNS ?? "1.1.1.1,8.8.8.8")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

const publicLookup: LookupFunction = (hostname, options, callback) => {
  resolver.resolve4(hostname, (err, addresses) => {
    if (err || addresses.length === 0) {
      dns.lookup(hostname, options, callback);
      return;
    }
    if (options?.all) {
      callback(null, addresses.map((address) => ({ address, family: 4 })));
    } else {
      callback(null, addresses[0], 4);
    }
  });
};

const publicDnsAgent = new Agent({
  connect: { lookup: publicLookup },
  keepAliveTimeout: 30_000,
});

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

export interface GetJsonOptions {
  publicDns?: boolean;
  timeoutMs?: number;
}

export async function getJson<T>(url: string, opts: GetJsonOptions = {}): Promise<T> {
  const res = await undiciFetch(url, {
    dispatcher: opts.publicDns ? publicDnsAgent : undefined,
    headers: { "user-agent": UA, accept: "application/json" },
    signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} em ${new URL(url).host}`);
  }
  return (await res.json()) as T;
}

/** Roda `fn` em todos os itens com no máximo `limit` chamadas ao mesmo tempo. */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = { status: "fulfilled", value: await fn(items[i]) };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
