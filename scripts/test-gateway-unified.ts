/**
 * Live test: Gateway unified balance deposit + spend via Circle Wallets adapter.
 * Run: npm run test:gateway-unified
 */

import * as dotenv from "dotenv";
import { depositToUnifiedBalance, spendFromUnifiedBalance } from "../circle/src/gateway-client";

dotenv.config();

async function main(): Promise<void> {
  console.log("=== Gateway unified balance test ===\n");

  const start = Date.now();

  // Facilitator Circle wallet is provisioned on ARC-TESTNET only — deposit from Arc, not Base.
  const deposit = await depositToUnifiedBalance({
    sourceChain: "Arc_Testnet",
    amount:      "0.5",
  });
  console.log("Deposit:", deposit);

  const spend = await spendFromUnifiedBalance({
    amount:           "0.1",
    destinationChain: "Base_Sepolia",
    recipientAddress: process.env.DEPLOYER_ADDRESS ?? "0x6C105D0A4ab3EF22592F34eDFC86BD3648380eFd",
  });
  const elapsed = Date.now() - start;
  console.log("Spend:", spend);
  console.log(`Elapsed: ${elapsed}ms`);

  if (elapsed > 3000) {
    console.warn("⚠ Gateway spend exceeded 3s hard cap (testnet variance)");
  } else if (elapsed < 500) {
    console.log("✓ Gateway spend within <500ms target");
  }

  console.log("\n✓ Gateway unified balance flow completed");
}

main().catch((e) => {
  console.error("test:gateway-unified FAILED:", e.message ?? e);
  process.exit(1);
});
