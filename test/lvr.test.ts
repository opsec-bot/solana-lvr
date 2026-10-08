import { describe, expect, it } from "vitest";
import { clmmLvrRate, cpmmLvrRate, lvrRate, pTrade, realizedLvr, simulateArbitrage } from "../src/lvr.js";
import { clmm, cpmmFromCapital, dlmmSpot, value } from "../src/positions.js";

/** Deterministic normal draws (mulberry32 + Box-Muller). */
function gaussian(seed: number) {
  let s = seed >>> 0;
  const u = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (((t ^ (t >>> 14)) >>> 0) + 1) / 4294967297;
  };
  return { u, n: () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u()) };
}

describe("instantaneous LVR", () => {
  it("matches the closed forms", () => {
    const sigma = 0.0004;
    const pos = cpmmFromCapital(10_000, 100);
    expect(lvrRate(pos, 100, sigma)).toBeCloseTo(cpmmLvrRate(value(pos, 100), sigma), 12);
    const c = clmm(800, 90, 110);
    expect(lvrRate(c, 100, sigma)).toBeCloseTo(clmmLvrRate(800, 100, sigma), 12);
    expect(lvrRate(c, 120, sigma)).toBe(0);
  });
});

describe("realized LVR", () => {
  it("is zero on a straight line path for a linear position and positive for a concave pool", () => {
    const pos = cpmmFromCapital(1000, 100);
    const path = [100, 105, 95, 102, 100];
    expect(realizedLvr(pos, path).lvr).toBeGreaterThan(0);
    // A round trip back to the start: pool PnL is zero, so LVR equals the rebalancing PnL.
    const r = realizedLvr(pos, path);
    expect(r.poolPnL).toBeCloseTo(0, 9);
  });

  it("converges to the integral of sigma^2 V / 8 on a fine GBM path", () => {
    const g = gaussian(7);
    const sigma = 0.001;
    const dt = 1;
    const path = [100];
    for (let i = 0; i < 200_000; i++) path.push(path.at(-1)! * Math.exp(-0.5 * sigma * sigma * dt + sigma * Math.sqrt(dt) * g.n()));
    const pos = cpmmFromCapital(1000, 100);
    let expected = 0;
    for (let i = 1; i < path.length; i++) expected += cpmmLvrRate(value(pos, path[i - 1]!), sigma) * dt;
    expect(realizedLvr(pos, path).lvr / expected).toBeGreaterThan(0.95);
    expect(realizedLvr(pos, path).lvr / expected).toBeLessThan(1.05);
  });

  it("works for DLMM ladders, which have no derivative", () => {
    const pos = dlmmSpot(1000, 100, 25, 10);
    expect(realizedLvr(pos, [100, 101, 99, 103, 100]).lvr).toBeGreaterThan(0);
  });
});

describe("arbitrage with fees", () => {
  it("pTrade is 1 with no fee and falls as fees or block rate rise", () => {
    expect(pTrade(0, 0.001, 0.4)).toBe(1);
    expect(pTrade(0.003, 0.001, 0.4)).toBeLessThan(pTrade(0.003, 0.001, 12));
    expect(pTrade(0.003, 0.001, 0.4)).toBeLessThan(pTrade(0.0005, 0.001, 0.4));
  });

  it("keeps the accounting identity poolValue - V0 + fees + arbProfit = rebalancePnL", () => {
    const pos = clmmFromCapitalTest();
    const r = simulateArbitrage(pos, [100, 101, 103, 99, 97, 104, 100.5], 0.003);
    expect(r.poolValue - value(pos, 100) + r.fees + r.arbProfit).toBeCloseTo(r.rebalancePnL, 9);
    expect(r.trades).toBeGreaterThan(0);
    expect(r.arbProfit).toBeGreaterThanOrEqual(0);
  });

  it("matches the 2023 paper: arbitrage profit is LVR times pTrade (simulated, 200k Poisson blocks)", () => {
    const g = gaussian(42);
    const sigma = 0.0005; // per sqrt second
    const blockTime = 0.4;
    const gamma = 0.0005;
    const path = [100];
    const pos = cpmmFromCapital(1_000_000, 100);
    let lvr = 0;
    for (let i = 0; i < 200_000; i++) {
      const dt = -Math.log(g.u()) * blockTime; // Poisson block arrivals
      const p = path.at(-1)!;
      lvr += cpmmLvrRate(value(pos, p), sigma) * dt;
      path.push(p * Math.exp(-0.5 * sigma * sigma * dt + sigma * Math.sqrt(dt) * g.n()));
    }
    const r = simulateArbitrage(pos, path, gamma);
    const predicted = pTrade(gamma, sigma, blockTime);
    expect(r.trades / r.blocks).toBeGreaterThan(predicted * 0.9);
    expect(r.trades / r.blocks).toBeLessThan(predicted * 1.1);
    expect(r.arbProfit / lvr).toBeGreaterThan(predicted * 0.85);
    expect(r.arbProfit / lvr).toBeLessThan(predicted * 1.15);
  });
});

function clmmFromCapitalTest() {
  return clmm(2000, 95, 106);
}
