import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { meter } from "../src/meter.js";
import { decodeRaydiumConfig, decodeRaydiumPool, decodeWhirlpool, loadPool, poolPrice } from "../src/pools.js";
import { Rpc } from "../src/rpc.js";
import { dailyVol, sigmaPerSqrtSecond } from "../src/vol.js";

// Live mainnet accounts saved 2026-10-08: Orca SOL-USDC 4 bp, Raydium CLMM SOL-USDC and its AMM config.
const ORCA = "Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE";
const RAY = "8sLbNZoA1cfnvMJLPfp98ZLAnFSYCFApfJKMbiXNLwxj";
const RAY_CFG = "9iFER3bpjf1PTTCQCfTRu17EJgvsxo9pVyA9QWwEuX4x";
const acct = (a: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/account-${a}.json`, import.meta.url), "utf8")) as { owner: string; data: string };
const buf = (a: string) => Buffer.from(acct(a).data, "base64");
const SOL = "So11111111111111111111111111111111111111112";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

describe("decoders on real accounts", () => {
  it("reads the Orca SOL-USDC whirlpool", () => {
    const w = decodeWhirlpool(buf(ORCA));
    expect([w.mintA, w.mintB]).toEqual([SOL, USDC]);
    expect(w.feeRate).toBe(0.0004);
    expect(w.tick).toBe(-22110);
    const price = poolPrice({ ...w, decimalsA: 9, decimalsB: 6 });
    expect(price).toBeCloseTo(109.614, 2);
    // The tick agrees with the price: 1.0001^tick, shifted by decimals.
    expect(1.0001 ** w.tick * 1e3).toBeCloseTo(price, 1);
  });

  it("reads the Raydium CLMM SOL-USDC pool and its fee", () => {
    const r = decodeRaydiumPool(buf(RAY));
    expect([r.mintA, r.mintB, r.decimalsA, r.decimalsB]).toEqual([SOL, USDC, 9, 6]);
    expect(r.ammConfig).toBe(RAY_CFG);
    expect(poolPrice(r)).toBeCloseTo(109.556, 2);
    expect(decodeRaydiumConfig(buf(RAY_CFG)).feeRate).toBe(0.0001);
  });
});

describe("loadPool", () => {
  it("picks the decoder by owner and fills in decimals and fees", async () => {
    const fake = (async (_u: string, init: { body: string }) => {
      const body = JSON.parse(init.body);
      const [address, opts] = body.params;
      const value =
        opts.encoding === "jsonParsed"
          ? { data: { parsed: { info: { decimals: address === SOL ? 9 : 6 } } } }
          : { owner: acct(address).owner, data: [acct(address).data, "base64"] };
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { value } }));
    }) as unknown as typeof fetch;
    const rpc = new Rpc("http://x", { fetch: fake });
    const orca = await loadPool(rpc, ORCA);
    expect([orca.venue, orca.decimalsA, orca.decimalsB]).toEqual(["orca-whirlpool", 9, 6]);
    const ray = await loadPool(rpc, RAY);
    expect([ray.venue, ray.feeRate]).toEqual(["raydium-clmm", 0.0001]);
  });
});

describe("volatility and meter", () => {
  it("recovers a known volatility", () => {
    const closes = [100];
    for (let i = 0; i < 1000; i++) closes.push(closes.at(-1)! * Math.exp(i % 2 ? 0.001 : -0.001));
    // Alternating +-0.1% every 60 s: per-step sd is 0.001.
    expect(sigmaPerSqrtSecond(closes, 60)).toBeCloseTo(0.001 / Math.sqrt(60), 5);
    expect(dailyVol(0.001 / Math.sqrt(60))).toBeCloseTo(0.001 * Math.sqrt(1440), 9);
  });

  it("meters the real Orca pool", () => {
    const w = decodeWhirlpool(buf(ORCA));
    const pool = { venue: "orca-whirlpool" as const, address: ORCA, decimalsA: 9, decimalsB: 6, ...w };
    const sigma = 0.04 / Math.sqrt(86_400); // 4% daily
    const m = meter(pool, sigma);
    expect(m.sigmaDaily).toBeCloseTo(0.04, 9);
    // LVR for a pool with virtual depth V at 4% daily vol: V * 0.04^2 / 8 per day.
    expect(m.lvrPerDay).toBeCloseTo((m.virtualDepth * 0.04 ** 2) / 8, 6);
    expect(m.pTrade).toBeGreaterThan(0);
    expect(m.pTrade).toBeLessThan(1);
    expect(m.breakEvenVolumePerDay).toBeCloseTo(m.arbProfitPerDay / 0.0004, 6);
  });
});
