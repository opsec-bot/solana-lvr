#!/usr/bin/env -S npx tsx
import { backtest, type BacktestResult } from "./backtest.js";
import { meter, type Meter } from "./meter.js";
import { loadPool } from "./pools.js";
import { clmmFromCapital, cpmmFromCapital, dlmmSpot, type Position } from "./positions.js";
import { fetchBinanceKlines, INTERVAL_SECONDS, type Interval } from "./prices.js";
import { Rpc } from "./rpc.js";
import { sigmaPerSqrtSecond } from "./vol.js";

const USAGE = `Usage:
  lvr meter <pool> [--rpc url] [--symbol SOLUSDC] [--hours 24] [--block-time 0.4] [--json]
  lvr backtest --shape clmm --range 100,120 --capital 10000 --fee 0.0004 [--symbol SOLUSDC] [--interval 1m] [--days 7] [--json]
  lvr backtest --shape dlmm --bin-step 10 --bins 20 --capital 10000 --fee 0.001 ...
  lvr backtest --shape cpmm --capital 10000 --fee 0.003 ...`;

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
}

function bool(args: string[], name: string): boolean {
  const i = args.indexOf(name);
  if (i === -1) return false;
  args.splice(i, 1);
  return true;
}

const usd = (x: number) => x.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const pct = (x: number, d = 2) => `${(x * 100).toFixed(d)}%`;

async function main(argv: string[]): Promise<number> {
  const [cmd, ...args] = argv;
  const json = bool(args, "--json");
  const symbol = flag(args, "--symbol") ?? "SOLUSDC";
  const now = Math.floor(Date.now() / 1000);

  if (cmd === "meter") {
    const rpc = new Rpc(flag(args, "--rpc") ?? process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com");
    const hours = Number(flag(args, "--hours") ?? 24);
    const blockTime = Number(flag(args, "--block-time") ?? 0.4);
    if (!args[0]) return usage();
    const pool = await loadPool(rpc, args[0]);
    const closes = (await fetchBinanceKlines(symbol, "1m", now - hours * 3600, now)).map((p) => p[1]);
    const m = meter(pool, sigmaPerSqrtSecond(closes, 60), blockTime);
    process.stdout.write((json ? JSON.stringify(m, null, 2) : meterText(m, symbol, hours)) + "\n");
    return 0;
  }

  if (cmd === "backtest") {
    const shape = flag(args, "--shape") ?? "clmm";
    const capital = Number(flag(args, "--capital") ?? 10_000);
    const fee = Number(flag(args, "--fee") ?? 0.0004);
    const interval = (flag(args, "--interval") ?? "1m") as Interval;
    const days = Number(flag(args, "--days") ?? 7);
    const range = flag(args, "--range");
    const binStep = Number(flag(args, "--bin-step") ?? 10);
    const bins = Number(flag(args, "--bins") ?? 20);
    if (!(interval in INTERVAL_SECONDS)) return usage();
    const path = (await fetchBinanceKlines(symbol, interval, now - Math.round(days * 86_400), now)).map((p) => p[1]);
    const P0 = path[0]!;
    let pos: Position;
    if (shape === "cpmm") pos = cpmmFromCapital(capital, P0);
    else if (shape === "dlmm") pos = dlmmSpot(capital, P0, binStep, bins);
    else if (shape === "clmm" && range) {
      const [pa, pb] = range.split(",").map(Number) as [number, number];
      pos = clmmFromCapital(capital, P0, pa, pb);
    } else return usage();
    const r = backtest(pos, path, fee);
    process.stdout.write((json ? JSON.stringify(r, null, 2) : backtestText(r, `${shape} ${symbol}, ${days} days of ${interval} candles, fee ${pct(fee, 3)}`)) + "\n");
    return 0;
  }
  return usage();
}

function meterText(m: Meter, symbol: string, hours: number): string {
  return [
    `Pool ${m.pool} (${m.venue})`,
    `Price ${m.price.toFixed(4)}, fee ${pct(m.feeRate, 3)}, ${symbol} volatility ${pct(m.sigmaDaily)} a day (last ${hours}h)`,
    `Active liquidity is worth ${usd(m.virtualDepth)} as a full-range pool`,
    "",
    `LVR at current liquidity:      ${usd(m.lvrPerDay)} a day`,
    `Blocks with an arbitrage:      ${pct(m.pTrade, 1)} (at ${m.blockTimeSec}s blocks)`,
    `Arbitrage profit after fees:   ${usd(m.arbProfitPerDay)} a day`,
    `Break-even trading volume:     ${usd(m.breakEvenVolumePerDay)} a day`,
    "",
    "LPs come out ahead of a rebalancing portfolio when ordinary volume beats the break-even line.",
  ].join("\n");
}

function backtestText(r: BacktestResult, title: string): string {
  return [
    title,
    `Price ${r.startPrice} -> ${r.endPrice}, ${r.points} prices, ${r.arbTrades} arbitrage trades`,
    "",
    `Start capital:        ${usd(r.capital)}`,
    `HODL at the end:      ${usd(r.hodl)}`,
    `Position at the end:  ${usd(r.poolValue)}`,
    `Fees from arbitrage:  ${usd(r.fees)}`,
    `Arbitrage profit:     ${usd(r.arbProfit)}`,
    `LVR (no fees):        ${usd(r.lvr)}`,
    `Impermanent loss:     ${usd(r.impermanentLoss)}`,
    `Net vs HODL:          ${usd(r.netVsHodl)}`,
    "",
    `Ordinary trading volume needed to cover arbitrage: ${usd(r.breakEvenVolume)} over the window.`,
  ].join("\n");
}

function usage(): number {
  process.stderr.write(USAGE + "\n");
  return 1;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  },
);
