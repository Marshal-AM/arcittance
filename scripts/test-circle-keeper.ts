/**
 * Live test: facilitator wallet executes runPayroll() on Arc testnet.
 * Run: npm run test:circle-keeper
 */

import * as dotenv from "dotenv";
import { runPayrollViaCircle, getWalletUsdcBalance } from "../circle/src/developer-client";
import { requirePayrollVaultAddress } from "./lib/resolve-payroll-vault";

dotenv.config();

async function main(): Promise<void> {
  const walletId = process.env.CIRCLE_FACILITATOR_WALLET_ID;
  if (!walletId) {
    throw new Error("CIRCLE_FACILITATOR_WALLET_ID is required — run npm run configure:circle-wallets");
  }

  const vault = requirePayrollVaultAddress();
  const balance = await getWalletUsdcBalance(walletId);
  console.log(`Facilitator USDC balance: ${balance}`);

  console.log(`Executing runPayroll() on ${vault} via Circle wallet ${walletId}…`);
  const result = await runPayrollViaCircle(walletId, vault);

  if (result.state !== "COMPLETE" && result.state !== "CONFIRMED") {
    throw new Error(`Keeper payroll failed — Circle state: ${result.state}`);
  }

  console.log("\n✓ Keeper payroll executed");
  console.log(`  Transaction ID: ${result.transactionId}`);
  console.log(`  State: ${result.state}`);
  if (result.txHash) console.log(`  Tx hash: ${result.txHash}`);
}

main().catch(err => {
  console.error("test:circle-keeper FAILED:", err.message ?? err);
  process.exit(1);
});
