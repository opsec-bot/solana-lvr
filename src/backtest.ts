import { realizedLvr, simulateArbitrage } from "./lvr.js";
import { value, type Position } from "./positions.js";

export interface BacktestResult {
  points: number;
  startPrice: number;
  endPrice: number;
  capital: number;
  /** Holding the starting tokens untouched. */
  hodl: number;
  /** The LP position at the end, fees not included. */
  poolValue: number;
  /** Fees paid by arbitrageurs to the position. */
  fees: number;
  /** What arbitrageurs made from the position after fees. */
  arbProfit: number;
  arbTrades: number;
  /** Frictionless loss-versus-rebalancing along the path (no fee band). */
  lvr: number;
  /** poolValue - hodl. */
  impermanentLoss: number;
  /** poolValue + fees - hodl. */
  netVsHodl: number;
  /** Volume from ordinary traders, over the whole window, whose fees would cover arbProfit. */
  breakEvenVolume: number;
}

/** Replays `path` (reference prices, one per block or candle) through `pos` with arbitrage at fee `gamma`. */
export function backtest(pos: Position, path: number[], gamma: number): BacktestResult {
  if (path.length < 2) throw new Error("need at least two prices");
  const start = path[0]!;
  const end = path.at(-1)!;
  const capital = value(pos, start);
  const hodl = pos.base(start) * end + pos.quote(start);
  const arb = simulateArbitrage(pos, path, gamma);
  return {
    points: path.length,
    startPrice: start,
    endPrice: end,
    capital,
    hodl,
    poolValue: arb.poolValue,
    fees: arb.fees,
    arbProfit: arb.arbProfit,
    arbTrades: arb.trades,
    lvr: realizedLvr(pos, path).lvr,
    impermanentLoss: arb.poolValue - hodl,
    netVsHodl: arb.poolValue + arb.fees - hodl,
    breakEvenVolume: gamma > 0 ? arb.arbProfit / gamma : Infinity,
  };
}
