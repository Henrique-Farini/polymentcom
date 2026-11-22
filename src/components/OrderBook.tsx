import type { BookLevel } from "@/lib/polymarket/types";

const fmtSize = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}K` : n.toFixed(0));

export function OrderBook({ bids, asks }: { bids: BookLevel[]; asks: BookLevel[] }) {
  const max = Math.max(1, ...bids.map((b) => b.size), ...asks.map((a) => a.size));
  const Row = ({ l, side }: { l: BookLevel; side: "bid" | "ask" }) => (
    <li className="relative flex justify-between px-3 py-0.5 text-xs">
      <span
        className={`absolute inset-y-0 right-0 ${side === "bid" ? "bg-up/15" : "bg-down/15"}`}
        style={{ width: `${(l.size / max) * 100}%` }}
      />
      <span className={`num relative ${side === "bid" ? "text-up" : "text-down"}`}>{(l.price * 100).toFixed(1)}¢</span>
      <span className="num relative text-muted">{fmtSize(l.size)}</span>
    </li>
  );
  const spread = asks[0] && bids[0] ? (asks[0].price - bids[0].price) * 100 : null;
  return (
    <div>
      <div className="flex justify-between px-3 pb-1 text-[10px] uppercase tracking-wider text-muted">
        <span>Preço (Sim)</span>
        <span>Quantidade</span>
      </div>
      <ul>
        {[...asks].reverse().map((l) => (
          <Row key={`a${l.price}`} l={l} side="ask" />
        ))}
      </ul>
      <div className="my-1 border-y border-line px-3 py-1 text-center text-xs text-muted">
        Spread <span className="num text-text">{spread === null ? "–" : `${spread.toFixed(1)}¢`}</span>
      </div>
      <ul>
        {bids.map((l) => (
          <Row key={`b${l.price}`} l={l} side="bid" />
        ))}
      </ul>
    </div>
  );
}
