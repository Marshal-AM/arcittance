/**
 * Provision or resolve Circle developer-controlled facilitator wallet.
 * Run: npm run configure:circle-wallets
 */

import * as dotenv from "dotenv";
import { createTestWallet, pingWalletsApi } from "../circle/src/wallets-client";
import { getDeveloperClient } from "../circle/src/developer-client";
import { getWalletUsdcBalance } from "../circle/src/developer-client";

dotenv.config();

async function main(): Promise<void> {
  console.log("=== Configure Circle Wallets ===\n");

  await pingWalletsApi();
  console.log("✓ Circle Wallets API reachable");

  const existingId = process.env.CIRCLE_FACILITATOR_WALLET_ID?.trim();
  if (existingId) {
    const client = getDeveloperClient();
    const wallet = await client.getWallet({ id: existingId });
    const address = wallet.data?.wallet?.address;
    const balance = await getWalletUsdcBalance(existingId);
    console.log(`\nFacilitator wallet (existing):`);
    console.log(`  CIRCLE_FACILITATOR_WALLET_ID=${existingId}`);
    console.log(`  Address: ${address}`);
    console.log(`  USDC balance: ${balance}`);
    return;
  }

  console.log("\nNo CIRCLE_FACILITATOR_WALLET_ID set — creating new ARC-TESTNET wallet…");
  const created = await createTestWallet();
  console.log(`\nAdd to .env:`);
  console.log(`  CIRCLE_FACILITATOR_WALLET_ID=${created.walletId}`);
  console.log(`  Address: ${created.address}`);
  console.log(`\nFund this wallet with USDC via https://faucet.circle.com (Arc Testnet)`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
