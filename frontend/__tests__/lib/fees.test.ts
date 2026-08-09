// frontend/__tests__/lib/fees.test.ts

import {
  buildFeeBreakdown,
  calculateProtocolFee,
  compareToCorrespondentBank,
  formatUsdcBaseUnits,
  parseUsdcToBaseUnits,
  estimateSettlementSeconds,
} from "@/lib/fees";

describe("fees.ts — remittance fee transparency", () => {
  it("parses and formats USDC base units", () => {
    expect(parseUsdcToBaseUnits("10.5")).toBe(10_500_000n);
    expect(formatUsdcBaseUnits(10_500_000n)).toBe("10.5");
  });

  it("calculates protocol fee in bps", () => {
    expect(calculateProtocolFee(1_000_000n, 25)).toBe(2_500n);
  });

  it("buildFeeBreakdown includes gas and protocol fees for arc-local", () => {
    const breakdown = buildFeeBreakdown({
      amountBaseUnits: 100_000_000n,
      routingMethod:   "arc-local",
    });
    expect(Number(breakdown.amount)).toBe(100);
    expect(Number(breakdown.protocolFee)).toBeCloseTo(0.25, 2);
    expect(Number(breakdown.gasFee)).toBeCloseTo(0.01, 2);
    expect(breakdown.settlementSeconds).toBe(2);
  });

  it("buildFeeBreakdown adds bridge fee for CCTP", () => {
    const breakdown = buildFeeBreakdown({
      amountBaseUnits: 50_000_000n,
      routingMethod:   "cctp",
      transferSpeed:   "fast",
      bridgeFeeUsdc:   0.08,
    });
    expect(Number(breakdown.bridgeFee)).toBeCloseTo(0.08, 2);
    expect(breakdown.settlementSeconds).toBe(20);
  });

  it("buildFeeBreakdown includes non-zero FX spread from StableFX", () => {
    const breakdown = buildFeeBreakdown({
      amountBaseUnits: 100_000_000n,
      routingMethod:   "cctp",
      transferSpeed:   "fast",
      bridgeFeeUsdc:   0.05,
      fxSpreadBps:     25,
    });
    expect(Number(breakdown.fxSpread)).toBeCloseTo(0.25, 2);
    expect(Number(breakdown.totalFees)).toBeGreaterThan(Number(breakdown.protocolFee));
  });

  it("estimateSettlementSeconds for CCTP fast is ~20s", () => {
    expect(estimateSettlementSeconds("cctp", "fast")).toBe(20);
  });

  it("compareToCorrespondentBank shows savings", () => {
    const cmp = compareToCorrespondentBank(1000);
    expect(cmp.bankFeeUsdc).toBeGreaterThan(cmp.arcittanceFeeUsdc);
    expect(cmp.savingsUsdc).toBeGreaterThan(0);
    expect(cmp.bankSettlementDays).toBe(4);
  });
});
