/**
 * AED ↔ USDC helpers — re-export for frontend API routes / UI.
 */
export {
  getAedUsdRate,
  getAedFxQuote,
  aedToUsdc,
  usdcToAed,
  clearAedFxCache,
  type AedFxQuote,
} from "../../../circle/src/aed-fx";
