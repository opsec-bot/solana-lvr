# Spec: solana-lvr v1

## Goal
Show Solana liquidity providers what arbitrage costs them, in dollars per day, and let them backtest a position before
they put money in. Two tools on one math core:

1. **Meter**: read a live Orca Whirlpool or Raydium CLMM pool, measure volatility from Binance, and print the pool's
   LVR per day, the share arbitrageurs actually take after fees, and the trading volume the pool needs to break even.
2. **Backtester**: replay a real price path through a constant product, concentrated (CLMM) or bin (DLMM) position and
   split its result into fees, loss-versus-rebalancing and impermanent loss.

## Background
LVR (loss-versus-rebalancing, Milionis, Moallemi, Roughgarden, Zhang 2022) is the cost of trading at stale prices
against informed arbitrageurs. Compare the pool with a portfolio that holds the same tokens but rebalances at market
prices. The gap is LVR. Unlike impermanent loss it does not undo when the price returns.

## Positions
A position is two functions of price `P` (quote per base): base held `x(P)` and quote held `y(P)`. Value
`V(P) = x(P) P + y(P)`.

| Shape | x(P) | y(P) |
|---|---|---|
| Constant product, `k` | `sqrt(k / P)` | `sqrt(k P)` |
| CLMM, liquidity `L` on `[pa, pb]`, in range | `L (1/sqrt(P) - 1/sqrt(pb))` | `L (sqrt(P) - sqrt(pa))` |
| CLMM below range / above range | `L (1/sqrt(pa) - 1/sqrt(pb))` / `0` | `0` / `L (sqrt(pb) - sqrt(pa))` |
| DLMM bins, bin `i` at price `p_i` with value `L_i` | `sum over p_i > P of L_i / p_i` | `sum over p_i <= P of L_i` |

Constructors build each shape from a starting capital in quote and a starting price.

## Math
**Instantaneous LVR.** With price volatility `sigma` (per square root second):
`lvr(P) = (sigma^2 P^2 / 2) |x'(P)|`. Closed forms:
- Constant product: `sigma^2 V / 8`.
- CLMM in range: `sigma^2 L sqrt(P) / 4`, zero out of range.

**Realized LVR along a path** `P_0 .. P_n`: `sum of x(P_{i-1}) (P_i - P_{i-1}) - (V(P_i) - V(P_{i-1}))`. Model free, and
it works for DLMM ladders where `x'` is a sum of spikes.

**Arbitrage with fees** (Milionis, Moallemi, Roughgarden 2023). With fee `gamma` and blocks arriving at rate
`lambda = 1 / blockTime`, arbitrageurs trade only when the price moves outside a band of width `gamma`. The chance a block
holds an arbitrage trade is `P_trade = 1 / (1 + eta)` with `eta = sqrt(2 lambda) gamma / sigma`. To leading order,
arbitrage profit = `LVR * P_trade`. Solana's 0.4 s blocks make `lambda` large, so `P_trade` is small and LPs keep more.
We check this formula with our own simulation in the tests.

**Break even.** LPs come out ahead of rebalancing when fees from ordinary traders exceed arbitrage profit:
`breakEvenVolume = LVR * P_trade / gamma` per day.

**Volatility.** `sigma` = standard deviation of log returns of Binance closes, divided by `sqrt(interval seconds)`.

## Meter
1. Read the pool account. Supported: Orca Whirlpool, Raydium CLMM. Layouts were checked against live SOL-USDC pools
   (`Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE`, `8sLbNZoA1cfnvMJLPfp98ZLAnFSYCFApfJKMbiXNLwxj`).
2. Price from `sqrtPriceX64`, active liquidity `L`, fee rate (Whirlpool field, or the Raydium AMM config account).
3. `sigma` from Binance 1 minute closes over the last 24 hours (configurable).
4. Print price, fee, `sigma` (daily %), LVR per day for the active liquidity, `P_trade`, arbitrage profit per day and
   break-even daily volume. All in quote units.

The meter uses only the liquidity active at the current tick, so it is the LVR rate right now, not over a range.

## Backtester
Inputs: shape and parameters, starting capital, fee, Binance symbol, interval and time window.
Simulates arbitrage with a fee band on the path (the pool price only moves when the reference leaves the band) and
reports:
- final pool value, HODL value, rebalancing portfolio value
- realized LVR, impermanent loss, fees earned from arbitrage, arbitrage profit
- net result vs HODL and vs rebalancing

Fees from ordinary traders are not modeled (no public per-position data). The report prints the volume that would be
needed to cover arbitrage instead.

## Non-goals (v1)
- Reading Meteora DLMM pool accounts. DLMM is supported in the backtester.
- Gas, rent and rebalancing your own position.

## CLI
```
lvr meter <pool address> [--rpc url] [--symbol SOLUSDC] [--hours 24] [--block-time 0.4]
lvr backtest --shape clmm --range 100,120 --capital 10000 --fee 0.0004 [--symbol SOLUSDC] [--interval 1m] [--days 7]
lvr backtest --shape dlmm --bin-step 10 --bins 20 ...
lvr backtest --shape cpmm ...
```
