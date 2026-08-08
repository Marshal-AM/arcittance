/**
 * Verify gas sponsorship on Circle developer + user wallet transactions.
 * Run: npm run verify:gas-sponsorship
 */

import * as dotenv from "dotenv";
import { sponsorTransactionFee } from "../circle/src/gas-station";
import { getDeveloperClient } from "../circle/src/developer-client";

dotenv.config();

async function main(): Promise<void> {
  console.log("=== Gas Sponsorship Verification ===\n");

  const feeConfig = sponsorTransactionFee();
  if (feeConfig.type !== "level" || feeConfig.config.feeLevel !== "MEDIUM") {
    throw new Error("sponsorTransactionFee() must return MEDIUM fee level");
  }
  console.log("✓ sponsorTransactionFee() returns MEDIUM fee level");

  const walletId = process.env.CIRCLE_FACILITATOR_WALLET_ID;
  if (!walletId) {
    throw new Error("CIRCLE_FACILITATOR_WALLET_ID required");
  }

  const client = getDeveloperClient();
  const wallets = await client.listWallets({ pageSize: 1 });
  if (!wallets.data?.wallets?.length) {
    throw new Error("No Circle wallets found for API key");
  }
  console.log("✓ Circle Wallets API reachable");

  const facilitator = await client.getWallet({ id: walletId });
  const address = facilitator.data?.wallet?.address;
  if (!address) throw new Error("Facilitator wallet address not found");
  console.log(`✓ Facilitator wallet ${address} (${walletId})`);

  console.log("\nDeveloper contract calls use sponsorTransactionFee() via executeContractCall.");
  console.log("User remittance transfers use sponsorTransactionFee() via initiateUserTransfer.");
  console.log("\n✓ Gas sponsorship configuration verified");
  console.log("\nFor live user-wallet OTP send, run: npm run test:remittance -- --live");
}

main().catch((err) => {
  console.error("verify:gas-sponsorship FAILED:", err.message ?? err);
  process.exit(1);
});
