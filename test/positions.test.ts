import { describe, expect, it } from "vitest";
import { clmm, clmmFromCapital, cpmm, cpmmFromCapital, dlmmSpot, value } from "../src/positions.js";

describe("positions", () => {
  it("constant product keeps x * y = k and splits value evenly", () => {
    const p = cpmm(10_000);
    for (const P of [0.5, 1, 100]) {
      expect(p.base(P) * p.quote(P)).toBeCloseTo(10_000, 6);
      expect(p.base(P) * P).toBeCloseTo(p.quote(P), 6);
    }
    expect(value(cpmmFromCapital(1000, 50), 50)).toBeCloseTo(1000, 9);
  });

  it("CLMM is all base below range, all quote above, continuous at the edges", () => {
    const p = clmm(100, 90, 110);
    expect(p.quote(80)).toBe(0);
    expect(p.base(120)).toBe(0);
    expect(p.base(90)).toBeCloseTo(p.base(90 + 1e-9), 6);
    expect(p.quote(110)).toBeCloseTo(p.quote(110 - 1e-9), 6);
    expect(value(clmmFromCapital(5000, 100, 90, 110), 100)).toBeCloseTo(5000, 9);
  });

  it("CLMM over a huge range matches constant product near the middle", () => {
    const c = clmmFromCapital(1000, 100, 1e-6, 1e10);
    const k = cpmmFromCapital(1000, 100);
    expect(value(c, 120)).toBeCloseTo(value(k, 120), 1);
  });

  it("analytic dBase matches a numerical derivative", () => {
    for (const p of [cpmm(4e6), clmm(500, 90, 110)]) {
      for (const P of [95, 100, 105]) {
        const h = 1e-4;
        expect(p.dBase!(P)).toBeCloseTo((p.base(P + h) - p.base(P - h)) / (2 * h), 6);
      }
    }
  });

  it("DLMM spot shape holds base above the price and quote at or below it", () => {
    const p = dlmmSpot(2100, 100, 10, 10);
    expect(value(p, 100)).toBeCloseTo(2100, 9);
    // 11 bins at or below 100 hold quote: 11 * 100.
    expect(p.quote(100)).toBeCloseTo(1100, 9);
    expect(p.base(1)).toBeGreaterThan(p.base(100));
    expect(p.base(1000)).toBe(0);
  });
});
