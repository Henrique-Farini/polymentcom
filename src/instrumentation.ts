/** Roda uma vez quando o servidor sobe: liga a vigilância da carteira de teste. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startLoop } = await import("@/lib/carteira/server");
    startLoop();
  }
}
