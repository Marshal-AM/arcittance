/**
 * Gas sponsorship configuration for Circle wallet transactions.
 * On Arc testnet, gas is USDC-native — facilitator wallet balance covers fees.
 */

export interface CircleFeeConfig {
  type: "level";
  config: { feeLevel: "LOW" | "MEDIUM" | "HIGH" };
}

export function sponsorTransactionFee(): CircleFeeConfig {
  return {
    type:   "level",
    config: { feeLevel: "MEDIUM" },
  };
}
