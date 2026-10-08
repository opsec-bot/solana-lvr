import { describe, expect, it } from "vitest";
import { backtest } from "../src/backtest.js";
import { clmmFromCapital, cpmmFromCapital, dlmmSpot } from "../src/positions.js";
import { fetchBinanceKlines } from "../src/prices.js";

describe("backtest", () => {
  const path = [100, 102, 104, 101, 97, 99, 103, 100];

  it("on a round trip the pool ends where it started and arbitrage is the only cost", () => {
    const r = backtest(cpmmFromCapital(10_000, 100), path, 0);
    expect(r.hodl).toBeCloseTo(10_000, 9);
    expect(r.poolValue).toBeCloseTo(10_000, 9);
    expect(r.fees).toBe(0);
    expect(r.arbProfit).toBeCloseTo(r.lvr, 9); // no fee: arbitrageurs take all of LVR
  });

  it("fees cut what arbitrageurs take", () => {
    const free = backtest(cpmmFromCapital(10_000, 100), path, 0);
    const fee = backtest(cpmmFromCapital(10_000, 100), path, 0.003);
    expect(fee.arbProfit).toBeLessThan(free.arbProfit);
    expect(fee.fees).toBeGreaterThan(0);
    expect(fee.breakEvenVolume).toBeCloseTo(fee.arbProfit / 0.003, 9);
  });

  it("a tight CLMM range loses more to arbitrage than a full-range pool of the same size", () => {
    const tight = backtest(clmmFromCapital(10_000, 100, 95, 105), path, 0.0005);
    const wide = backtest(cpmmFromCapital(10_000, 100), path, 0.0005);
    expect(tight.lvr).toBeGreaterThan(wide.lvr * 5);
  });

  it("runs DLMM ladders", () => {
    const r = backtest(dlmmSpot(10_000, 100, 25, 20), path, 0.001);
    expect(r.capital).toBeCloseTo(10_000, 9);
    expect(r.lvr).toBeGreaterThan(0);
  });
});

describe("fetchBinanceKlines", () => {
  it("pages 1000 candles per request at any interval", async () => {
    const urls: string[] = [];
    const fake = (async (url: string) => {
      urls.push(url);
      const start = Number(new URL(url).searchParams.get("startTime"));
      return new Response(JSON.stringify([[start, "0", "0", "0", "7"]]));
    }) as unknown as typeof fetch;
    const pts = await fetchBinanceKlines("SOLUSDC", "1m", 0, 60 * 2500, fake);
    expect(urls).toHaveLength(3);
    expect(urls[1]).toContain("interval=1m");
    expect(pts[1]).toEqual([60_000, 7]);
  });
});
