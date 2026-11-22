/** Só aceita pedidos feitos no próprio computador e vindos da própria página (bloqueia outros sites). */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

function hostname(h: string | null) {
  if (!h) return null;
  return h.startsWith("[") ? h.slice(0, h.indexOf("]") + 1) : h.split(":")[0];
}

export function isLocalRequest(req: Request) {
  const host = req.headers.get("host");
  if (!LOCAL_HOSTS.has(hostname(host) ?? "")) return false;
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== host) return false;
    } catch {
      return false;
    }
  }
  return true;
}
