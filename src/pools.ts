import bs58 from "bs58";
import type { Rpc } from "./rpc.js";

export const ORCA_WHIRLPOOL = "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc";
export const RAYDIUM_CLMM = "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK";

export interface PoolState {
  venue: "orca-whirlpool" | "raydium-clmm";
  address: string;
  mintA: string;
  mintB: string;
  decimalsA: number;
  decimalsB: number;
  sqrtPriceX64: bigint;
  /** Liquidity active at the current tick, in raw units. */
  liquidity: bigint;
  tick: number;
  /** Fee as a fraction, e.g. 0.0004 for 4 bp. */
  feeRate: number;
}

const pk = (d: Uint8Array, o: number) => bs58.encode(d.subarray(o, o + 32));
const u128 = (b: Buffer, o: number) => b.readBigUInt64LE(o) + (b.readBigUInt64LE(o + 8) << 64n);

/** Orca Whirlpool account. Fee rate is in hundredths of a basis point. Decimals are not stored here. */
export function decodeWhirlpool(data: Buffer) {
  return {
    feeRate: data.readUInt16LE(45) / 1_000_000,
    liquidity: u128(data, 49),
    sqrtPriceX64: u128(data, 65),
    tick: data.readInt32LE(81),
    mintA: pk(data, 101),
    mintB: pk(data, 181),
  };
}

/** Raydium CLMM pool account. The fee lives in the AMM config account it points to. */
export function decodeRaydiumPool(data: Buffer) {
  return {
    ammConfig: pk(data, 9),
    mintA: pk(data, 73),
    mintB: pk(data, 105),
    decimalsA: data[233]!,
    decimalsB: data[234]!,
    liquidity: u128(data, 237),
    sqrtPriceX64: u128(data, 253),
    tick: data.readInt32LE(269),
  };
}

/** Raydium CLMM AMM config account. Trade fee is in millionths. */
export function decodeRaydiumConfig(data: Buffer) {
  return { feeRate: data.readUInt32LE(47) / 1_000_000 };
}

/** Pool price in B per A, in whole tokens. */
export function poolPrice(p: Pick<PoolState, "sqrtPriceX64" | "decimalsA" | "decimalsB">): number {
  const s = Number(p.sqrtPriceX64) / 2 ** 64;
  return s * s * 10 ** (p.decimalsA - p.decimalsB);
}

interface AccountInfo {
  owner: string;
  data: [string, string];
}

async function account(rpc: Rpc, address: string): Promise<{ owner: string; data: Buffer }> {
  const r = await rpc.call<{ value: AccountInfo | null }>("getAccountInfo", [address, { encoding: "base64" }]);
  if (!r.value) throw new Error(`account ${address} not found`);
  return { owner: r.value.owner, data: Buffer.from(r.value.data[0], "base64") };
}

async function mintDecimals(rpc: Rpc, mint: string): Promise<number> {
  const r = await rpc.call<{ value: { data: { parsed: { info: { decimals: number } } } } | null }>("getAccountInfo", [
    mint,
    { encoding: "jsonParsed" },
  ]);
  if (!r.value) throw new Error(`mint ${mint} not found`);
  return r.value.data.parsed.info.decimals;
}

/** Reads an Orca Whirlpool or Raydium CLMM pool, picking the decoder by the account's owner program. */
export async function loadPool(rpc: Rpc, address: string): Promise<PoolState> {
  const { owner, data } = await account(rpc, address);
  if (owner === ORCA_WHIRLPOOL) {
    const w = decodeWhirlpool(data);
    const [decimalsA, decimalsB] = await Promise.all([mintDecimals(rpc, w.mintA), mintDecimals(rpc, w.mintB)]);
    return { venue: "orca-whirlpool", address, decimalsA, decimalsB, ...w };
  }
  if (owner === RAYDIUM_CLMM) {
    const { ammConfig, ...pool } = decodeRaydiumPool(data);
    const cfg = decodeRaydiumConfig((await account(rpc, ammConfig)).data);
    return { venue: "raydium-clmm", address, feeRate: cfg.feeRate, ...pool };
  }
  throw new Error(`${address} is owned by ${owner}, which is not a supported pool program`);
}
