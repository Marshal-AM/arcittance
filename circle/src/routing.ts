/**
 * Cross-chain routing selection for Arcittance payroll and remittance flows.
 *
 * V1: Arc-local for same-chain; CCTP for all cross-chain transfers.
 */

export type RoutingMethod = "arc-local" | "cctp";

export type PayoutType =
  | "point-to-point"
  | "marketplace-batch";

export interface RoutingInput {
  destinationChainId: number;
  payoutType?: PayoutType;
}

/** Pure routing selector — mirrors PayrollVault routingMethod semantics (0 = CCTP). */
export function selectRoutingMethod(input: RoutingInput): RoutingMethod {
  if (input.destinationChainId === 0) {
    return "arc-local";
  }
  return "cctp";
}

/** Map high-level routing method to on-chain PayrollVault uint8 (null = Arc-local). */
export function routingMethodToOnChain(method: RoutingMethod): 0 | null {
  if (method === "cctp") return 0;
  return null;
}
