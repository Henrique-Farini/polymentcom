import { describe, expect, it } from "vitest";
import { atrPercent, bollingerPercentB, bollingerSeries, emaSeries, macdHistogram, rsi, rsiSeries, sma, smaSeries } from "@/lib/indicators";

const rising = Array.from({ length: 60 }, (_, i) => 100 + i);
const falling = Array.from({ length: 60 }, (_, i) => 200 - i);

describe("sma", () => {
  it("média dos últimos N valores", () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toBe(4);
  });
  it("null quando não há dados suficientes", () => {
    expect(sma([1, 2], 3)).toBeNull();
  });
});

describe("emaSeries", () => {
  it("começa na média simples do primeiro período", () => {
    expect(emaSeries([2, 4, 6, 8], 3)[0]).toBe(4);
  });
});

describe("rsi", () => {
  it("100 quando só sobe", () => {
    expect(rsi(rising)).toBe(100);
  });
  it("0 quando só cai", () => {
    expect(rsi(falling)).toBe(0);
  });
  it("50 quando não se move", () => {
    expect(rsi(Array(30).fill(10))).toBe(50);
  });
  it("valor conhecido (exemplo clássico de Wilder)", () => {
    const closes = [
      44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28,
    ];
    expect(rsi(closes)!).toBeCloseTo(70.46, 1);
  });
});

describe("macdHistogram", () => {
  it("positivo numa alta que acelera", () => {
    const accel = Array.from({ length: 80 }, (_, i) => 100 + i * i * 0.05);
    expect(macdHistogram(accel)!.hist).toBeGreaterThan(0);
  });
  it("null com poucos dados", () => {
    expect(macdHistogram([1, 2, 3])).toBeNull();
  });
});

describe("bollingerPercentB", () => {
  it("acima de 0.5 numa alta", () => {
    expect(bollingerPercentB(rising)!).toBeGreaterThan(0.5);
  });
  it("0.5 quando o preço não varia", () => {
    expect(bollingerPercentB(Array(25).fill(10))).toBe(0.5);
  });
});

describe("atrPercent", () => {
  it("range constante de 2 em preço 100 = 2%", () => {
    const n = 30;
    const closes = Array(n).fill(100);
    expect(atrPercent(Array(n).fill(101), Array(n).fill(99), closes)).toBeCloseTo(2, 5);
  });
});

describe("séries", () => {
  const closes = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.0];
  it("rsiSeries termina igual ao rsi()", () => {
    const s = rsiSeries(closes);
    expect(s[13]).toBeNull();
    expect(s[s.length - 1]!).toBeCloseTo(rsi(closes)!, 10);
  });
  it("smaSeries termina igual ao sma()", () => {
    const s = smaSeries(closes, 5);
    expect(s[3]).toBeNull();
    expect(s[s.length - 1]!).toBeCloseTo(sma(closes, 5)!, 10);
  });
  it("bollingerSeries: banda do meio é a média", () => {
    const b = bollingerSeries(closes, 5);
    expect(b[3]).toBeNull();
    expect(b[b.length - 1]!.mid).toBeCloseTo(sma(closes, 5)!, 10);
    expect(b[b.length - 1]!.upper).toBeGreaterThan(b[b.length - 1]!.lower);
  });
});
