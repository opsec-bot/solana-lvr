/** A liquidity position as base and quote holdings at each price (quote per base). */
export interface Position {
  shape: "cpmm" | "clmm" | "dlmm";
  base(P: number): number;
  quote(P: number): number;
  /** dx/dP where it exists. Omitted for shapes with jumps (DLMM). */
  dBase?(P: number): number;
}

export function value(pos: Position, P: number): number {
  return pos.base(P) * P + pos.quote(P);
}

/** Constant product x * y = k. */
export function cpmm(k: number): Position {
  return {
    shape: "cpmm",
    base: (P) => Math.sqrt(k / P),
    quote: (P) => Math.sqrt(k * P),
    dBase: (P) => -0.5 * Math.sqrt(k) * P ** -1.5,
  };
}

/** Constant product holding `capital` (in quote) at price P0. */
export function cpmmFromCapital(capital: number, P0: number): Position {
  // V = 2 sqrt(k P0)
  return cpmm((capital / 2) ** 2 / P0);
}

/** Concentrated liquidity L on [pa, pb], Uniswap v3 style (Orca Whirlpools, Raydium CLMM). */
export function clmm(L: number, pa: number, pb: number): Position {
  if (!(pa > 0 && pb > pa)) throw new Error("need 0 < pa < pb");
  const sa = Math.sqrt(pa);
  const sb = Math.sqrt(pb);
  return {
    shape: "clmm",
    base: (P) => (P <= pa ? L * (1 / sa - 1 / sb) : P >= pb ? 0 : L * (1 / Math.sqrt(P) - 1 / sb)),
    quote: (P) => (P <= pa ? 0 : P >= pb ? L * (sb - sa) : L * (Math.sqrt(P) - sa)),
    dBase: (P) => (P <= pa || P >= pb ? 0 : -0.5 * L * P ** -1.5),
  };
}

/** CLMM on [pa, pb] holding `capital` (in quote) at price P0. */
export function clmmFromCapital(capital: number, P0: number, pa: number, pb: number): Position {
  const unit = clmm(1, pa, pb);
  return clmm(capital / value(unit, P0), pa, pb);
}

export interface Bin {
  price: number;
  /** Bin value in quote. Held as base (value / price) while the price is below the bin, as quote at or above it. */
  liquidity: number;
}

/** A ladder of price bins, Meteora DLMM style. Each bin swaps all its base for quote at its own price. */
export function dlmm(bins: Bin[]): Position {
  const sorted = [...bins].sort((a, b) => a.price - b.price);
  return {
    shape: "dlmm",
    base: (P) => sorted.reduce((s, b) => (b.price > P ? s + b.liquidity / b.price : s), 0),
    quote: (P) => sorted.reduce((s, b) => (b.price <= P ? s + b.liquidity : s), 0),
  };
}

/**
 * The "spot" DLMM shape: 2n+1 bins centered on P0 (bin step in basis points), each worth the same at P0.
 * Bins above P0 hold base, so their liquidity is scaled by price / P0 to make each worth an equal share now.
 */
export function dlmmSpot(capital: number, P0: number, binStepBps: number, binsEachSide: number): Position {
  const r = 1 + binStepBps / 10_000;
  const share = capital / (2 * binsEachSide + 1);
  const bins: Bin[] = [];
  for (let k = -binsEachSide; k <= binsEachSide; k++) {
    const price = P0 * r ** k;
    bins.push({ price, liquidity: k > 0 ? (share * price) / P0 : share });
  }
  return dlmm(bins);
}
