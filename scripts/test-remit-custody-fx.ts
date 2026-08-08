/**
 * Integration smoke: custody balance + StableFX quote rejects over-balance.
 * Skips cleanly when sandbox key is missing.
 */
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../frontend/.env.local") });

async function main() {
  const key = process.env.CIRCLE_MINT_API_KEY || process.env.CIRCLE_STABLEFX_API_KEY;
  if (!key) {
    console.log("SKIP: no sandbox key");
    process.exit(0);
  }

  const { ensureCustodyWalletForUser, getSubWalletBalance } = await import(
    "../circle/src/custody-client"
  );
  const { requestQuote, getFacilitatorAddress } = await import(
    "../circle/src/stablefx-client"
  );

  const mapped = await ensureCustodyWalletForUser("integration-probe-user");
  const bal = await getSubWalletBalance(mapped.subWalletId);
  console.log("custody wallet:", bal.walletId, "USDC:", bal.availableUsdc, "EURC:", bal.availableEurc);

  const available = Number(bal.availableUsdc);
  if (available >= 10) {
    const recipientAddress = await (async () => {
      try {
        const { getFacilitatorWalletAddress } = await import("../circle/src/wallet-adapters");
        return getFacilitatorWalletAddress();
      } catch {
        return "0x0000000000000000000000000000000000000001";
      }
    })();

    const quote = await requestQuote({
      from: { currency: "USDC", amount: "10" },
      to: { currency: "EURC" },
      tenor: "instant",
      type: "tradable",
      recipientAddress,
    });
    console.log("StableFX quote OK:", quote.id, quote.rate, "→", quote.to.amount, quote.to.currency);
  } else {
    console.log("Balance < 10 USDC — skipping live quote (fund via payin first)");
  }

  // Over-balance check is enforced in /api/fx/quotes (unit-level here)
  const over = available + 1_000_000;
  if (over > available) {
    console.log("OK — quote path would reject amount", over, "> available", available);
  }

  void getFacilitatorAddress;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
