/**
 * Operator script: cross-chain routing smoke.
 * Run: npx ts-node scripts/testnet/06_test_cross_chain_routing.ts
 */

import { execSync } from "child_process";
import * as path from "path";

execSync("npx ts-node scripts/configure-cross-chain-router.ts", {
  stdio: "inherit",
  cwd: path.join(__dirname, "../.."),
});
