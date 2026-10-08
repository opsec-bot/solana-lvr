# Research notes

Read October 2026.

## LVR
- Milionis, Moallemi, Roughgarden, Zhang (2022), *Automated Market Making and Loss-Versus-Rebalancing*,
  [arXiv:2208.06046](https://arxiv.org/abs/2208.06046). Defines LVR, gives `lvr = sigma^2 P^2 / 2 |x'(P)|` and
  `sigma^2 V / 8` for constant product pools.
- Milionis, Moallemi, Roughgarden (2023), *Automated Market Making and Arbitrage Profits in the Presence of Fees*,
  [arXiv:2305.14604](https://arxiv.org/abs/2305.14604), FC 2024. With fee `gamma` and block rate `lambda`, the
  probability a block holds an arbitrage trade is `1 / (1 + eta)`, `eta = sqrt(2 lambda) gamma / sigma` (the fee
  in units of one standard deviation of returns over half a block interval). In fast block chains, arbitrage profit is
  LVR scaled by that probability, so faster blocks cut LP losses.
  Summary: [Roughgarden's TLDR](https://www.timroughgarden.org/tldr/lvrfees.pdf).

## Measurement so far
- Flashbots research (Elaine Hu, [Devcon 7 talk](https://speak.devcon.org/devcon7-sea/talk/T8BXK3)) compared
  realized and theoretical LVR on Ethereum, Arbitrum and Base.
- We found no LVR measurement or LP backtester for Solana pools (Orca Whirlpools, Raydium CLMM, Meteora DLMM). Searches
  turned up explainers and comparison sites only.

## Why Solana is interesting here
Solana's blocks are about 0.4 s. By the 2023 paper, that should make `P_trade` much smaller than on Ethereum for the
same fee and volatility, so concentrated LPs on Solana should lose less to arbitrage per unit of LVR. Nobody has put
numbers on that for Solana pools. The meter does.

## Account layouts (checked)
Decoded against live mainnet accounts on 2026-10-08:
- Orca Whirlpool (653 bytes): fee rate u16 at 45 (hundredths of a bp), liquidity u128 at 49, sqrt price Q64.64 at 65,
  current tick i32 at 81, mint A at 101, mint B at 181. SOL-USDC 4 bp pool read 109.61, tick -22110.
- Raydium CLMM pool (1544 bytes): AMM config at 9, mint 0 at 73, mint 1 at 105, decimals at 233 and 234, liquidity
  u128 at 237, sqrt price at 253, current tick at 269. SOL-USDC pool read 109.56, tick -22115.
- Raydium AMM config (117 bytes): trade fee u32 at 47, in millionths. The SOL-USDC pool's config reads 100 (1 bp).
