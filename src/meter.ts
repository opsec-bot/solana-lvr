import { clmmLvrRate, pTrade } from "./lvr.js";
import { poolPrice, type PoolState } from "./pools.js";

export interface Meter {
  pool: string;
  venue: string;
  price: number;
  feeRate: number;
  /** Daily volatility as a fraction. */
  sigmaDaily: number;
  /** Value of a constant product pool with the same local liquidity, in quote. */
  virtualDepth: number;
  /** Frictionless LVR per day for the liquidity active now, in quote. */
  lvrPerDay: number;
  blockTimeSec: number;
  pTrade: number;
  /** LVR * pTrade: what arbitrageurs take per day after paying fees, in quote. */
  arbProfitPerDay: number;
  /** Daily volume from ordinary traders whose fees would cover arbProfitPerDay, in quote. */
  breakEvenVolumePerDay: number;
}

/**
 * LVR for a CLMM pool right now. In raw units the local LVR rate is sigma^2 L sqrt(P_raw) / 4 raw quote per second,
 * where P_raw = (sqrtPriceX64 / 2^64)^2.
 */
export function meter(pool: PoolState, sigma: number, blockTimeSec = 0.4): Meter {
  const sqrtRaw = Number(pool.sqrtPriceX64) / 2 ** 64;
  const L = Number(pool.liquidity);
  const quoteScale = 10 ** pool.decimalsB;
  const lvrPerDay = (clmmLvrRate(L, sqrtRaw * sqrtRaw, sigma) * 86_400) / quoteScale;
  const pt = pTrade(pool.feeRate, sigma, blockTimeSec);
  const arbProfitPerDay = lvrPerDay * pt;
  return {
    pool: pool.address,
    venue: pool.venue,
    price: poolPrice(pool),
    feeRate: pool.feeRate,
    sigmaDaily: sigma * Math.sqrt(86_400),
    virtualDepth: (2 * L * sqrtRaw) / quoteScale,
    lvrPerDay,
    blockTimeSec,
    pTrade: pt,
    arbProfitPerDay,
    breakEvenVolumePerDay: pool.feeRate > 0 ? arbProfitPerDay / pool.feeRate : Infinity,
  };
}
