import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("cli", () => {
  it("prints usage and exits 1 on bad input", () => {
    const r = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", "backtest", "--shape", "clmm"], { encoding: "utf8" });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("lvr meter <pool>");
  }, 30_000);
});
