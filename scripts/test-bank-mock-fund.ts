/**
 * Optional live smoke for Path B bank-mock (treasury → Payins → ledger).
 *   npx ts-node scripts/test-bank-mock-fund.ts
 */
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function main(): Promise<void> {
  const { getAedFxQuote, aedToUsdc } = await import("../circle/src/aed-fx");
  const { getTreasuryAddress, getTreasuryUsdcBalance } = await import(
    "../circle/src/treasury-client"
  );
  const { getBusinessBalances } = await import("../circle/src/custody-client");

  console.log("=== Bank-mock preflight ===");
  const fx = await getAedFxQuote(true);
  console.log("AED→USD:", fx.aedToUsd, "source:", fx.source);
  console.log("100 AED →", aedToUsdc("100", fx.aedToUsd), "USDC");
  console.log("Treasury:", getTreasuryAddress());
  console.log("Treasury USDC:", await getTreasuryUsdcBalance());
  console.log("Mint balances:", JSON.stringify((await getBusinessBalances()).available));
  console.log(
    "\nUI path: /remit → Path B · Bank-mock → Fund Mint & continue → Send"
  );
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
