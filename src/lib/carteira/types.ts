/** Carteira de teste: dinheiro de mentira, preços reais. Valores em reais (BRL). */

export type Area = "bolsa" | "polymarket";
export type PosStatus = "pendente" | "aberta" | "fechada";
export type ExitReason = "stop" | "prazo" | "manual" | "resolvido";

export interface Position {
  id: string;
  area: Area;
  /** Código do Yahoo (Bolsa) ou id do mercado (Polymarket). */
  ref: string;
  label: string;
  sub: string;
  /** Moeda do preço do ativo. */
  currency: "BRL" | "USD";
  /** Valor reservado/investido, em reais. */
  amountBRL: number;
  /** Stop: sai se o preço cair esta fração desde a compra (0.08 = 8%). */
  stopPct: number | null;
  /** Quantos dias fica investido depois da compra. */
  holdDays: number;
  createdAt: number;
  status: PosStatus;
  /* Preenchidos na compra */
  filledAt?: number;
  entryPrice?: number;
  fxEntry?: number;
  qty?: number;
  exitAt?: number;
  /* Atualizados a cada leitura */
  lastPrice?: number;
  lastAt?: number;
  fxLast?: number;
  minPrice?: number;
  maxPrice?: number;
  /* Preenchidos na venda */
  closedAt?: number;
  exitPrice?: number;
  exitReason?: ExitReason;
  /** Resultado final em reais. */
  pnlBRL?: number;
}

export interface CarteiraEvent {
  t: number;
  kind: "compra" | "venda" | "stop" | "prazo" | "info";
  text: string;
}

export interface EquityPoint {
  t: number;
  value: number;
}

export interface Carteira {
  startCash: number;
  cash: number;
  createdAt: number;
  /** Quando o teste termina (só para exibir). */
  endsAt: number | null;
  positions: Position[];
  events: CarteiraEvent[];
  equity: EquityPoint[];
  lastCheck: number | null;
  lastError: string | null;
}

export interface Quote {
  price: number;
  /** Momento da última negociação (ms). */
  time: number;
  /** Polymarket: mercado encerrado, `price` já é 0 ou 1. */
  resolved?: boolean;
}
