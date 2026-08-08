/**
 * Frontend/server re-exports for StableFX + facilitator address helpers.
 */
export {
  checkStableFxAccess,
  requestQuote,
  createTrade,
  executeTakerTrade,
  aedToUsdc,
  feeToSpreadBps,
  AED_USD_PEG,
  waitForTradeStatus,
  getTrade,
} from "../../../circle/src/stablefx-client";

export type {
  StableFxQuote,
  StableFxTrade,
  ExecuteTakerTradeResult,
  StableFxProgressEvent,
} from "../../../circle/src/stablefx-client";

export async function getFacilitatorAddress(): Promise<string> {
  try {
    const { getFacilitatorWalletAddress } = await import(
      "../../../circle/src/wallet-adapters"
    );
    return getFacilitatorWalletAddress();
  } catch {
    const { getFacilitatorEoaAddress } = await import(
      "../../../circle/src/wallet-adapters"
    );
    return getFacilitatorEoaAddress();
  }
}
