/**
 * Live StableFX sandbox quote → (optional) execute when STABLEFX_LIVE_EXECUTE=1.
 * Run: npx hardhat test test/integration/arc-stablefx-remittance.test.ts --network arcTestnet
 */
import { expect } from "chai";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "../../.env") });

describe("Arc StableFX remittance (live sandbox)", function () {
  this.timeout(180_000);

  it("requests a live tradable USDC→EURC quote", async function () {
    if (!process.env.CIRCLE_STABLEFX_API_KEY) {
      this.skip();
    }

    const { requestQuote, aedToUsdc, checkStableFxAccess, feeToSpreadBps } =
      await import("../../circle/src/stablefx-client");

    const access = checkStableFxAccess();
    expect(access.status).to.equal("configured");

    const usdc = aedToUsdc("36.725");
    expect(Number(usdc)).to.be.closeTo(10, 0.01);

    const quote = await requestQuote({
      from: { currency: "USDC", amount: usdc },
      to: { currency: "EURC" },
      tenor: "instant",
      type: "tradable",
      recipientAddress:
        process.env.STABLEFX_TAKER_ADDRESS ??
        "0x1f531ce3c418bbd830d06138a9e5b5eacfdfb3d6",
    });

    expect(quote.id).to.be.a("string").with.length.greaterThan(10);
    expect(Number(quote.rate)).to.be.greaterThan(0);
    expect(quote.expiresAt).to.be.a("string");
    const bps = feeToSpreadBps(quote.fee, usdc);
    expect(bps).to.be.greaterThanOrEqual(0);
    console.log("  quote", quote.id, "rate", quote.rate, "fee", quote.fee, "bps", bps);
  });

  it("executes full taker settle when STABLEFX_LIVE_EXECUTE=1", async function () {
    if (!process.env.CIRCLE_STABLEFX_API_KEY || process.env.STABLEFX_LIVE_EXECUTE !== "1") {
      this.skip();
    }

    const { executeTakerTrade } = await import("../../circle/src/stablefx-client");
    const result = await executeTakerTrade({
      fromCurrency: "USDC",
      toCurrency: "EURC",
      fromAmount: "10",
      timeoutMs: 180_000,
    });

    expect(result.trade.id).to.be.a("string");
    expect(["completed", "taker_funded"]).to.include(result.trade.status.toLowerCase());
    console.log("  trade", result.trade.id, result.trade.status, result.settlementTransactionHash);
  });
});
