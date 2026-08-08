/**
 * Live StableFX sandbox quote probe.
 * Run: npx ts-node scripts/test-stablefx-quote.ts
 */
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "../.env") });

async function main() {
  const { requestQuote, checkStableFxAccess, aedToUsdc } = await import(
    "../circle/src/stablefx-client"
  );

  console.log("Access:", checkStableFxAccess());
  const recipient =
    process.env.STABLEFX_TAKER_ADDRESS ??
    "0x1f531ce3c418bbd830d06138a9e5b5eacfdfb3d6";

  const aed = "36.725";
  const usdc = aedToUsdc(aed);
  console.log(`AED ${aed} → USDC ${usdc}`);

  const quote = await requestQuote({
    from: { currency: "USDC", amount: usdc },
    to: { currency: "EURC" },
    tenor: "instant",
    type: "tradable",
    recipientAddress: recipient,
  });

  console.log(JSON.stringify({
    id: quote.id,
    rate: quote.rate,
    from: quote.from,
    to: quote.to,
    fee: quote.fee,
    expiresAt: quote.expiresAt,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
