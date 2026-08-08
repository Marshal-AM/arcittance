/**
 * Create a Circle sandbox payment intent (Payins) and print deposit details.
 * Requires CIRCLE_STABLEFX_API_KEY or CIRCLE_MINT_API_KEY.
 *
 *   npx ts-node --project scripts/tsconfig.json scripts/test-payin-intent.ts
 */
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../frontend/.env.local") });

async function main() {
  const key = process.env.CIRCLE_MINT_API_KEY || process.env.CIRCLE_STABLEFX_API_KEY;
  if (!key) {
    console.error("SKIP: CIRCLE_STABLEFX_API_KEY / CIRCLE_MINT_API_KEY not set");
    process.exit(0);
  }

  const { createPaymentIntent, waitForDepositAddress } = await import(
    "../circle/src/payins-client"
  );

  const intent = await createPaymentIntent({
    amount: "10.00",
    currency: "USD",
    chain: "ARC",
    type: "transient",
  });
  console.log("paymentIntentId:", intent.id, "status:", intent.status);

  const withAddr = intent.depositAddress
    ? intent
    : await waitForDepositAddress(intent.id, { timeoutMs: 45_000 });

  console.log("depositAddress:", withAddr.depositAddress ?? "(pending)");
  console.log("chain:", withAddr.chain);
  console.log("merchantWalletId:", withAddr.merchantWalletId);
  console.log("OK — send USDC on Arc to the deposit address, then poll GET /v1/paymentIntents/:id");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
