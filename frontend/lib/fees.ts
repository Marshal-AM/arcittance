/**
 * Fee transparency helpers for remittance and cross-chain payroll UI.
 * Amounts are USDC base units (6 decimals) unless noted.
 */

export const TOKEN_DECIMALS = 6;
export const CORRESPONDENT_BANK_FEE_BPS = 250; // ~2.5% midpoint
export const CORRESPONDENT_SETTLEMENT_DAYS = 4;
export const DEFAULT_PROTOCOL_FEE_BPS = 25; // 0.25% remittance vault fee
/** Display-only reference — sponsored gas is NOT deducted from send amount */
export const DEFAULT_GAS_FEE_USDC = 0.01;

export type RoutingMethodUi = "arc-local" | "cctp" | "gateway";
export type TransferSpeedUi = "standard" | "fast";

export interface FeeEstimateInput {
  amountBaseUnits: bigint;
  routingMethod: RoutingMethodUi;
  transferSpeed?: TransferSpeedUi;
  protocolFeeBps?: number;
  bridgeFeeUsdc?: number;
  gasFeeUsdc?: number;
  fxSpreadBps?: number;
}

export interface FeeBreakdown {
  amount: string;
  protocolFee: string;
  gasFee: string;
  gasSponsored: boolean;
  bridgeFee: string;
  fxSpread: string;
  totalFees: string;
  netAmount: string;
  settlementSeconds: number;
}

export interface CorrespondentComparison {
  arcittanceFeeUsdc: number;
  arcittanceSettlementSeconds: number;
  bankFeeUsdc: number;
  bankSettlementDays: number;
  savingsUsdc: number;
}

export function parseUsdcToBaseUnits(amount: string): bigint {
  const [whole, frac = ""] = amount.split(".");
  const padded = (frac + "000000").slice(0, TOKEN_DECIMALS);
  return BigInt(whole || "0") * 10n ** BigInt(TOKEN_DECIMALS) + BigInt(padded);
}

export function formatUsdcBaseUnits(value: bigint | string): string {
  const n = typeof value === "bigint" ? value : BigInt(value);
  const negative = n < 0n;
  const abs = negative ? -n : n;
  const whole = abs / 10n ** BigInt(TOKEN_DECIMALS);
  const frac = abs % 10n ** BigInt(TOKEN_DECIMALS);
  const fracStr = frac.toString().padStart(TOKEN_DECIMALS, "0").replace(/0+$/, "");
  const formatted = fracStr ? `${whole}.${fracStr}` : whole.toString();
  return negative ? `-${formatted}` : formatted;
}

export function calculateProtocolFee(amount: bigint, feeBps: number): bigint {
  return (amount * BigInt(feeBps)) / 10_000n;
}

export function estimateSettlementSeconds(
  routingMethod: RoutingMethodUi,
  transferSpeed: TransferSpeedUi = "fast"
): number {
  if (routingMethod === "arc-local") return 2;
  if (routingMethod === "gateway") return 1;
  return transferSpeed === "fast" ? 20 : 900;
}

/** Pure fee breakdown for FeePanel — bridge/gas values may come from API estimates. */
export function buildFeeBreakdown(input: FeeEstimateInput): FeeBreakdown {
  const protocolFeeBps = input.protocolFeeBps ?? DEFAULT_PROTOCOL_FEE_BPS;
  const protocolFee = calculateProtocolFee(input.amountBaseUnits, protocolFeeBps);

  const gasFeeUsdc = input.gasFeeUsdc ?? DEFAULT_GAS_FEE_USDC;
  const bridgeFeeUsdc =
    input.routingMethod === "cctp" ? (input.bridgeFeeUsdc ?? 0.05) : 0;
  const fxSpreadBps = input.fxSpreadBps ?? 0;
  const fxSpread =
    fxSpreadBps > 0
      ? (input.amountBaseUnits * BigInt(fxSpreadBps)) / 10_000n
      : 0n;

  const gasFee = parseUsdcToBaseUnits(gasFeeUsdc.toFixed(TOKEN_DECIMALS));
  const bridgeFee = parseUsdcToBaseUnits(bridgeFeeUsdc.toFixed(TOKEN_DECIMALS));
  // Sponsored Arc gas is paid by Circle — do not subtract from recipient net.
  const totalFees = protocolFee + bridgeFee + fxSpread;
  const netAmount =
    input.amountBaseUnits > totalFees
      ? input.amountBaseUnits - totalFees
      : 0n;

  return {
    amount: formatUsdcBaseUnits(input.amountBaseUnits),
    protocolFee: formatUsdcBaseUnits(protocolFee),
    gasFee: formatUsdcBaseUnits(gasFee),
    gasSponsored: true,
    bridgeFee: formatUsdcBaseUnits(bridgeFee),
    fxSpread: formatUsdcBaseUnits(fxSpread),
    totalFees: formatUsdcBaseUnits(totalFees),
    netAmount: formatUsdcBaseUnits(netAmount),
    settlementSeconds: estimateSettlementSeconds(
      input.routingMethod,
      input.transferSpeed
    ),
  };
}

export function compareToCorrespondentBank(amountUsdc: number): CorrespondentComparison {
  const arcittanceFeeUsdc = amountUsdc * (DEFAULT_PROTOCOL_FEE_BPS / 10_000);
  const bankFeeUsdc = amountUsdc * (CORRESPONDENT_BANK_FEE_BPS / 10_000);
  return {
    arcittanceFeeUsdc,
    arcittanceSettlementSeconds: 20,
    bankFeeUsdc,
    bankSettlementDays: CORRESPONDENT_SETTLEMENT_DAYS,
    savingsUsdc: Math.max(0, bankFeeUsdc - arcittanceFeeUsdc),
  };
}

export function routingMethodFromOnChain(
  destinationChainId: number,
  routingMethod?: number
): RoutingMethodUi {
  if (destinationChainId === 0) return "arc-local";
  if (routingMethod === 1) return "gateway";
  return "cctp";
}
