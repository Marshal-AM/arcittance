/**
 * Live smoke: Path B Payouts from Mint payments wallet (the $19.82 pool).
 *   npx ts-node scripts/test-mint-payout-smoke.ts
 *
 * Sends a small USDC payout on Arc to prove createPayout works with current balances.
 */
import * as dotenv from "dotenv";
import * as path from "path";
import { randomUUID } from "crypto";

dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../frontend/.env.local") });

async function main(): Promise<void> {
  const key =
    process.env.CIRCLE_MINT_API_KEY?.trim() ||
    process.env.CIRCLE_STABLEFX_API_KEY?.trim();
  if (!key) {
    console.error("CIRCLE_MINT_API_KEY / CIRCLE_STABLEFX_API_KEY required");
    process.exit(1);
  }

  const {
    getBusinessBalances,
    getPrimaryCustodyWallet,
    getSubWalletBalance,
  } = await import("../circle/src/custody-client");
  const { addRecipient, createPayout, waitForPayoutTerminal } = await import(
    "../circle/src/payouts-client"
  );
  const { getFacilitatorEoaAddress } = await import(
    "../circle/src/wallet-adapters"
  );

  const amount = process.argv.find((a) => a.startsWith("--amount="))?.slice(9) ?? "1.00";
  const recipientAddress =
    process.argv.find((a) => a.startsWith("--to="))?.slice(5) ??
    getFacilitatorEoaAddress();

  console.log("=== Mint Payouts smoke test ===");
  console.log("Amount:", amount, "USDC → Arc");
  console.log("To:", recipientAddress);

  const biz = await getBusinessBalances();
  console.log("\nBusiness balances:", JSON.stringify(biz.available));

  const wallet = await getPrimaryCustodyWallet();
  console.log("Primary custody walletId:", wallet.walletId);
  try {
    const bal = await getSubWalletBalance(wallet.walletId);
    console.log("Wallet available:", JSON.stringify(bal.available));
    console.log("  USDC:", bal.availableUsdc, "EURC:", bal.availableEurc);
  } catch (e) {
    console.warn("getSubWalletBalance failed:", e instanceof Error ? e.message : e);
  }

  console.log("\n── addRecipient ──");
  const recip = await addRecipient({
    chain: "ARC",
    address: recipientAddress,
    currency: "USDC",
    nickname: "payout-smoke",
    idempotencyKey: randomUUID(),
  });
  console.log("recipientId:", recip.id, "status:", recip.status);

  console.log("\n── createPayout ──");
  const payout = await createPayout({
    recipientId: recip.id,
    amount: Number(amount).toFixed(2),
    currency: "USDC",
    sourceWalletId: wallet.walletId,
    idempotencyKey: randomUUID(),
    purposeOfTransfer: "PMT001",
  });
  console.log("payoutId:", payout.id, "status:", payout.status);
  console.log("raw keys:", Object.keys(payout.raw).join(", "));

  console.log("\n── poll ──");
  const terminal = await waitForPayoutTerminal(payout.id, {
    timeoutMs: 90_000,
    pollIntervalMs: 3_000,
  });
  console.log("final status:", terminal.status);
  console.log("txHash:", terminal.transactionHash ?? "(none)");
  console.log("errorCode:", terminal.errorCode ?? "(none)");

  const bizAfter = await getBusinessBalances();
  console.log("\nBusiness balances after:", JSON.stringify(bizAfter.available));

  const ok = ["complete", "completed", "pending"].includes(
    terminal.status.toLowerCase()
  );
  if (!ok || ["failed", "denied", "cancelled"].includes(terminal.status.toLowerCase())) {
    console.error("\n✗ Payout did not succeed");
    process.exit(2);
  }
  console.log("\n✓ Payouts API accepted/spent from Mint wallet — Path B delivery path is viable");
}

main().catch((e) => {
  console.error("FATAL:", e.message ?? e);
  process.exit(1);
});
