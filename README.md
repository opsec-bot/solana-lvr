# solana-lvr

How much do arbitrageurs take from Solana liquidity providers? This measures it.

LVR (loss-versus-rebalancing) is the cost an AMM pays for trading at stale prices against arbitrageurs who know the
real price. Unlike impermanent loss it never comes back when the price does. It has been measured on Ethereum and its
L2s. As far as we could find, nobody had put numbers on it for Solana pools.

Two tools on one math core:

- **meter**: reads a live Orca Whirlpool or Raydium CLMM pool and prints its LVR per day, how much of that arbitrageurs
  actually capture after fees at Solana's block speed, and the daily volume the pool needs to break even.
- **backtest**: replays real Binance prices through a constant product, concentrated range or Meteora style bin
  position, and splits the result into fees, arbitrage profit, LVR and impermanent loss.

## Example
```
$ npx tsx src/cli.ts meter Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE
Pool Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE (orca-whirlpool)
Price 109.7526, fee 0.040%, SOLUSDC volatility 3.63% a day (last 24h)
Active liquidity is worth 335,352,017.41 as a full-range pool

LVR at current liquidity:      55,269.00 a day
Blocks with an arbitrage:      12.1% (at 0.4s blocks)
Arbitrage profit after fees:   6,707.02 a day
Break-even trading volume:     16,767,558.56 a day
```

More output, including a backtest, is in [docs/sample-2026-10-08.md](docs/sample-2026-10-08.md).

## The math
A position is the base `x(P)` and quote `y(P)` it holds at each price `P`.

- **LVR rate**: `(sigma^2 P^2 / 2) |x'(P)|` per unit time. That is `sigma^2 V / 8` for a constant product pool and
  `sigma^2 L sqrt(P) / 4` inside a concentrated range (Milionis, Moallemi, Roughgarden, Zhang 2022).
- **Realized LVR on a path**: `sum of x(P_{i-1}) (P_i - P_{i-1}) - (V(P_i) - V(P_{i-1}))`. Works for bin ladders too.
- **Fees and block speed** (Milionis, Moallemi, Roughgarden 2023): arbitrageurs only trade when the price leaves a band
  as wide as the fee. The share of blocks with a trade is `1 / (1 + sqrt(2 / blockTime) * fee / sigma)`, and
  arbitrage profit is LVR times that share. Solana's 0.4 s blocks make the share small.

The tests check that last formula with our own simulation: 200,000 Poisson blocks of geometric Brownian motion
against a fee band. The simulated trade frequency and arbitrage profit both land within the tolerance of the formula.
They also check the accounting identity `pool - start + fees + arbitrage profit = rebalancing PnL` exactly.

Full spec in [docs/SPEC.md](docs/SPEC.md), sources and the checked account layouts in [docs/RESEARCH.md](docs/RESEARCH.md).

## Try it
Needs Node 22 or newer.

```sh
npm install
npm test

npx tsx src/cli.ts meter <whirlpool or raydium clmm pool address>
npx tsx src/cli.ts backtest --shape clmm --range 100,120 --capital 10000 --fee 0.0004 --days 7
npx tsx src/cli.ts backtest --shape dlmm --bin-step 10 --bins 20 --capital 10000 --fee 0.001 --days 7
npx tsx src/cli.ts backtest --shape cpmm --capital 10000 --fee 0.0025 --interval 1s --days 0.25
```

Add `--json` to any command for machine-readable output. `meter` uses the public RPC unless you pass `--rpc` or set
`SOLANA_RPC_URL`.

## Limits
- The meter uses the liquidity active at the current tick. It is the LVR rate right now, not over the day.
- The backtest counts only fees paid by arbitrageurs. Real LPs also earn from ordinary traders; the output prints the
  volume that would need to come from them to break even.
- The backtest's arbitrage happens once per candle. Use `--interval 1s` to get closer to Solana's real block speed.
- Meteora DLMM pool accounts are not read yet. DLMM positions work in the backtester.

## License
MIT
