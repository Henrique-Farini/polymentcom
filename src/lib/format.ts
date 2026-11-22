export function money(n: number, currency = "USD"): string {
  const symbol = currency === "BRL" ? "R$" : currency === "USD" ? "$" : "";
  const abs = Math.abs(n);
  const s =
    abs >= 1e9
      ? `${(n / 1e9).toFixed(2)}B`
      : abs >= 1e6
        ? `${(n / 1e6).toFixed(2)}M`
        : abs >= 1e3
          ? `${(n / 1e3).toFixed(1)}K`
          : n.toFixed(0);
  return `${symbol}${s}`;
}

export function price(n: number, currency = ""): string {
  const digits = n >= 1000 ? 0 : n >= 1 ? 2 : 4;
  const symbol = currency === "BRL" ? "R$ " : currency === "USD" ? "$" : "";
  return symbol + n.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function signedPct(n: number, digits = 2): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(digits)}%`;
}

export function signedPts(n: number | null): string {
  if (n === null) return "–";
  const v = n * 100;
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}`;
}

export function prob(n: number): string {
  const v = n * 100;
  return `${v < 1 && v > 0 ? v.toFixed(1) : v.toFixed(0)}%`;
}

export function timeAgo(ms: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return `há ${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `há ${h}h`;
  return `há ${Math.round(h / 24)} dias`;
}

export function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
