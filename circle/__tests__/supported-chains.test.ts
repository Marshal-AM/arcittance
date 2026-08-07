import {
  getSupportedChains,
  isChainSupportedForCurrency,
  PAYOUT_SUPPORTED_CHAINS,
} from "../src/supported-chains";

describe("supported-chains", () => {
  it("lists 8 EURC chains including ARC", () => {
    const eurc = getSupportedChains("EURC");
    expect(eurc).toHaveLength(8);
    expect(eurc).toContain("ARC");
    expect(eurc).not.toContain("ARB");
  });

  it("lists full USDC set", () => {
    expect(getSupportedChains("USDC").length).toBe(PAYOUT_SUPPORTED_CHAINS.USDC.length);
    expect(isChainSupportedForCurrency("USDC", "ARB")).toBe(true);
    expect(isChainSupportedForCurrency("EURC", "arb")).toBe(false);
  });

  it("is case-insensitive for chain checks", () => {
    expect(isChainSupportedForCurrency("EURC", "arc")).toBe(true);
    expect(isChainSupportedForCurrency("EURC", "SOL")).toBe(true);
  });
});
