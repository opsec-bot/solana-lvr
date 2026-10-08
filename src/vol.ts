/** Volatility of log returns per square root second, from closes taken every `intervalSec` seconds. */
export function sigmaPerSqrtSecond(closes: number[], intervalSec: number): number {
  const r: number[] = [];
  for (let i = 1; i < closes.length; i++) r.push(Math.log(closes[i]! / closes[i - 1]!));
  if (r.length < 2) throw new Error("need at least 3 closes");
  const mean = r.reduce((a, b) => a + b, 0) / r.length;
  const variance = r.reduce((s, x) => s + (x - mean) ** 2, 0) / (r.length - 1);
  return Math.sqrt(variance / intervalSec);
}

/** sigma per sqrt second scaled to one day. */
export function dailyVol(sigma: number): number {
  return sigma * Math.sqrt(86_400);
}
