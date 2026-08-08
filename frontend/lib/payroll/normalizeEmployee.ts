import type { Employee } from "@/lib/types";

/** Wagmi/viem returns uint fields as bigint — normalize for UI + comparisons. */
export function normalizeEmployee(
  raw: Record<string, unknown>,
  id?: bigint,
): Employee {
  return {
    id:                 id ?? 0n,
    wallet:             raw.wallet as `0x${string}`,
    salaryAmount:       raw.salaryAmount as bigint,
    payToken:           raw.payToken as `0x${string}`,
    payInterval:        raw.payInterval as bigint,
    nextPaymentDue:     raw.nextPaymentDue as bigint,
    approvedCap:        raw.approvedCap as bigint,
    destinationChainId: Number(raw.destinationChainId ?? 0),
    routingMethod:      Number(raw.routingMethod ?? 0),
    transferSpeed:      Number(raw.transferSpeed ?? 0),
    active:             Boolean(raw.active),
  };
}
