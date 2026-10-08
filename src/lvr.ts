import { value, type Position } from "./positions.js";

/** Instantaneous LVR rate in quote per second: (sigma^2 P^2 / 2) |x'(P)|, sigma per sqrt second. */
export function lvrRate(pos: Position, P: number, sigma: number): number {
  const h = P * 1e-6;
  const d = pos.dBase ? pos.dBase(P) : (pos.base(P + h) - pos.base(P - h)) / (2 * h);
  return ((sigma * sigma * P * P) / 2) * Math.abs(d);
}

/** Constant product closed form: sigma^2 V / 8. */
export function cpmmLvrRate(V: number, sigma: number): number {
  return (sigma * sigma * V) / 8;
}

/** CLMM in range closed form: sigma^2 L sqrt(P) / 4. */
export function clmmLvrRate(L: number, P: number, sigma: number): number {
  return (sigma * sigma * L * Math.sqrt(P)) / 4;
}

/**
 * Probability that a block holds an arbitrage trade, Milionis, Moallemi, Roughgarden (2023):
 * 1 / (1 + eta), eta = sqrt(2 lambda) gamma / sigma, lambda = 1 / blockTime.
 */
export function pTrade(gamma: number, sigma: number, blockTimeSec: number): number {
  return 1 / (1 + (Math.sqrt(2 / blockTimeSec) * gamma) / sigma);
}

export interface RealizedLvr {
  /** Rebalancing portfolio PnL minus pool PnL. Never negative for a concave pool. */
  lvr: number;
  poolPnL: number;
  rebalancePnL: number;
}

/** Frictionless realized LVR along a price path: sum of x(P_{i-1}) dP - dV. */
export function realizedLvr(pos: Position, path: number[]): RealizedLvr {
  let rebalancePnL = 0;
  for (let i = 1; i < path.length; i++) rebalancePnL += pos.base(path[i - 1]!) * (path[i]! - path[i - 1]!);
  const poolPnL = value(pos, path.at(-1)!) - value(pos, path[0]!);
  return { lvr: rebalancePnL - poolPnL, poolPnL, rebalancePnL };
}

export interface ArbResult {
  /** Fees paid by arbitrageurs to the LP, in quote at the time of each trade. */
  fees: number;
  /** Arbitrageurs' profit, marked at the reference price of each trade, after fees. */
  arbProfit: number;
  trades: number;
  blocks: number;
  /** Pool price after the last block. */
  poolPrice: number;
  /** Value of the LP's holdings at the end, at the last reference price, fees not included. */
  poolValue: number;
  /** PnL of a portfolio that always holds what the pool holds, rebalancing at reference prices. */
  rebalancePnL: number;
}

/**
 * Arbitrage against a pool with fee gamma, one chance per block. The pool price only moves when the reference price
 * leaves the no-trade band [poolPrice e^-gamma, poolPrice e^gamma]; the arbitrageur then trades the pool to the band edge.
 * Fees are taken on the input token and counted in quote at once.
 *
 * Holds exactly: poolValue - V0 + fees + arbProfit = rebalancePnL.
 */
export function simulateArbitrage(pos: Position, path: number[], gamma: number): ArbResult {
  const eg = Math.exp(gamma);
  let pool = path[0]!;
  let fees = 0;
  let arbProfit = 0;
  let trades = 0;
  let rebalancePnL = 0;
  for (let i = 1; i < path.length; i++) {
    const c = path[i]!;
    rebalancePnL += pos.base(pool) * (c - path[i - 1]!);
    let next = pool;
    if (c > pool * eg) next = c / eg;
    else if (c < pool / eg) next = c * eg;
    if (next === pool) continue;
    const dx = pos.base(next) - pos.base(pool); // pool's base change
    const dy = pos.quote(next) - pos.quote(pool); // pool's quote change
    let fee: number;
    if (dx < 0) {
      // Arb buys base, pays quote dy plus fee.
      fee = dy * (eg - 1);
      arbProfit += -dx * c - dy * eg;
    } else {
      // Arb sells base dx plus fee, receives quote -dy.
      fee = dx * (eg - 1) * c;
      arbProfit += -dy - dx * eg * c;
    }
    fees += fee;
    trades++;
    pool = next;
  }
  const end = path.at(-1)!;
  return {
    fees,
    arbProfit,
    trades,
    blocks: path.length - 1,
    poolPrice: pool,
    poolValue: pos.base(pool) * end + pos.quote(pool),
    rebalancePnL,
  };
}
