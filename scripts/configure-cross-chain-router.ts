/**
 * Configure cross-chain routing — validate CCTP config and print domain map.
 * Run: npm run configure:cross-chain
 */

import * as dotenv from "dotenv";
import { validateCctpBridgeKitConfig } from "../circle/src/cctp-client";
import { CCTP_DESTINATIONS } from "../config/cctp-domains";

dotenv.config();

async function main(): Promise<void> {
  console.log("=== Configure Cross-Chain Router ===\n");

  const cctp = validateCctpBridgeKitConfig();
  console.log(`✓ CCTP config valid (arcDomain=${cctp.arcDomain})`);

  console.log("\nDestination domains:");
  for (const d of CCTP_DESTINATIONS) {
    console.log(`  ${d.domain} — ${d.label} (${d.bridgeKitName})`);
  }

  console.log("\n=== Cross-chain configuration OK (CCTP) ===");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
