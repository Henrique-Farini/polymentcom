import "server-only";
import { cached } from "./cache";
import { getJson } from "./net";

/**
 * CDI diário oficial (Banco Central, série SGS 12). É a referência de "dinheiro parado rendendo":
 * uma estratégia de risco só vale a pena se render mais que o CDI.
 */

const SGS = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados";

export interface CdiIndex {
  /** Datas (segundos, meia-noite UTC) em ordem. */
  t: number[];
  /** Índice acumulado no fim de cada data (começa em 1). */
  idx: number[];
  /** Taxa anual atual (252 dias úteis). */
  annualNow: number;
}

const fmt = (d: Date) => `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;

export function getCdi() {
  return cached("cdi:index", 12 * 60 * 60_000, async (): Promise<CdiIndex> => {
    // O Banco Central limita cada consulta diária a 10 anos.
    const now = new Date();
    const chunks: [Date, Date][] = [];
    for (let y = 2009; y <= now.getUTCFullYear(); y += 9) {
      chunks.push([new Date(Date.UTC(y, 0, 1)), new Date(Math.min(Date.UTC(y + 8, 11, 31), now.getTime()))]);
    }
    const rows: { data: string; valor: string }[] = [];
    for (const [a, b] of chunks) {
      rows.push(...(await getJson<{ data: string; valor: string }[]>(`${SGS}?formato=json&dataInicial=${fmt(a)}&dataFinal=${fmt(b)}`)));
    }
    const seen = new Set<number>();
    const pts = rows
      .map((r) => {
        const [d, m, y] = r.data.split("/").map(Number);
        return { t: Date.UTC(y, m - 1, d) / 1000, r: Number(r.valor) / 100 };
      })
      .filter((p) => Number.isFinite(p.r) && !seen.has(p.t) && seen.add(p.t))
      .sort((a, b) => a.t - b.t);
    const t: number[] = [];
    const idx: number[] = [];
    let acc = 1;
    for (const p of pts) {
      acc *= 1 + p.r;
      t.push(p.t);
      idx.push(acc);
    }
    const last = pts.at(-1)?.r ?? 0;
    return { t, idx, annualNow: (1 + last) ** 252 - 1 };
  });
}

/** Índice acumulado até o instante `tSec` (inclusive). */
export function cdiAt(c: CdiIndex, tSec: number) {
  let lo = 0;
  let hi = c.t.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (c.t[m] <= tSec) (ans = m), (lo = m + 1);
    else hi = m - 1;
  }
  return ans < 0 ? 1 : c.idx[ans];
}

/** Rendimento do CDI entre dois instantes. */
export function cdiReturn(c: CdiIndex, fromSec: number, toSec: number) {
  return cdiAt(c, toSec) / cdiAt(c, fromSec) - 1;
}
