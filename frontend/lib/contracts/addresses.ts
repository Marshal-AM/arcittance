// frontend/lib/contracts/addresses.ts
/**
 * Contract address registry for Arcittance on Arc testnet.
 * Source of truth: deployments/arc/addresses.json
 */

import {
  CCTP_DESTINATIONS,
  getDestinationByDomain,
  getDestinationLabel,
  type CctpDestination,
} from "../../../config/cctp-domains";

export const CHAIN_ID = Number(
  process.env.NEXT_PUBLIC_ARC_CHAIN_ID ?? "5042002"
) as 5042002;

export const TOKEN_DECIMALS = 6;

export const USDC_ADDRESS = (
  process.env.NEXT_PUBLIC_USDC_ADDRESS ??
  "0x3600000000000000000000000000000000000000"
) as `0x${string}`;

export const EURC_ADDRESS = (
  process.env.NEXT_PUBLIC_EURC_ADDRESS ??
  "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a"
) as `0x${string}`;

export const ARC_EXPLORER_URL = "https://testnet.arcscan.app";

export type SupportedToken = "USDC" | "EURC";

export const TOKEN_CONFIG: Record<
  SupportedToken,
  { address: `0x${string}`; decimals: number; symbol: string }
> = {
  USDC: { address: USDC_ADDRESS, decimals: TOKEN_DECIMALS, symbol: "USDC" },
  EURC: { address: EURC_ADDRESS, decimals: TOKEN_DECIMALS, symbol: "EURC" },
};

/** Arc-local settlement — destinationChainId 0 in PayrollVault / RemittanceVault. */
export const ARC_LOCAL_DOMAIN = 0;

export interface DestinationChain extends CctpDestination {
  domain: number;
}

/** CCTP destination chains for UI pickers (Arc local + cross-chain domains). */
export const DESTINATION_CHAINS: DestinationChain[] = [
  {
    domain:        ARC_LOCAL_DOMAIN,
    chainId:       CHAIN_ID,
    bridgeKitName: "Arc_Testnet",
    circleChainId: "ARC-TESTNET",
    label:         "Arc (local)",
    country:       "UAE / Arc",
    explorerBase:  ARC_EXPLORER_URL,
    usdcAddress:   USDC_ADDRESS,
  },
  ...CCTP_DESTINATIONS.filter((d) => d.domain > 0),
];

/** Explorer for a destination-domain mint/spend (not Arc debit). */
export function getDestinationExplorerBase(domain: number): string {
  if (domain === ARC_LOCAL_DOMAIN) return ARC_EXPLORER_URL;
  return getDestinationByDomain(domain)?.explorerBase ?? ARC_EXPLORER_URL;
}

export const DESTINATION_CHAIN_NAMES: Record<number, string> = Object.fromEntries(
  DESTINATION_CHAINS.map((d) => [d.domain, d.label])
);

export const ROUTING_CCTP = 0;
export const ROUTING_GATEWAY = 1;
/** Circle Mint Payins → StableFX → Payouts (consumer /remit rail). */
export const ROUTING_MINT_PAYOUT = 2;
export const TRANSFER_SPEED_STANDARD = 0;
export const TRANSFER_SPEED_FAST = 1;

export const ROUTING_METHOD_LABELS: Record<number, string> = {
  [ROUTING_CCTP]:         "CCTP (point-to-point)",
  [ROUTING_GATEWAY]:      "Gateway (unified balance)",
  [ROUTING_MINT_PAYOUT]:  "Mint Payins + StableFX + Payouts",
};

export const TRANSFER_SPEED_LABELS: Record<number, string> = {
  [TRANSFER_SPEED_STANDARD]: "Standard (~15 min)",
  [TRANSFER_SPEED_FAST]:     "Fast (~20 sec)",
};

export type DestinationChainId = number;

export function getDestinationChain(domain: number): DestinationChain | undefined {
  return DESTINATION_CHAINS.find((d) => d.domain === domain);
}

export function destinationLabel(domain: number): string {
  if (domain === ARC_LOCAL_DOMAIN) return "Arc (local)";
  return getDestinationLabel(domain);
}

export function getContractAddresses() {
  const registry = process.env.NEXT_PUBLIC_PAYROLL_ORG_REGISTRY_ADDRESS;
  const escrow   = process.env.NEXT_PUBLIC_CONDITIONAL_ESCROW_ADDRESS;
  const sub      = process.env.NEXT_PUBLIC_SUBSCRIPTION_MANAGER_ADDRESS;
  const remit    = process.env.NEXT_PUBLIC_REMITTANCE_VAULT_ADDRESS;

  if (!registry) {
    throw new Error(
      "Missing env var: NEXT_PUBLIC_PAYROLL_ORG_REGISTRY_ADDRESS. Add it to .env.local from deployments/arc/addresses.json"
    );
  }
  if (!escrow) {
    throw new Error(
      "Missing env var: NEXT_PUBLIC_CONDITIONAL_ESCROW_ADDRESS. Add it to .env.local from deployments/arc/addresses.json"
    );
  }
  if (!sub) {
    throw new Error(
      "Missing env var: NEXT_PUBLIC_SUBSCRIPTION_MANAGER_ADDRESS. Add it to .env.local from deployments/arc/addresses.json"
    );
  }

  return {
    PayrollOrgRegistry:  registry as `0x${string}`,
    ConditionalEscrow:   escrow   as `0x${string}`,
    SubscriptionManager: sub      as `0x${string}`,
    RemittanceVault:     remit    as `0x${string}` | undefined,
  } as const;
}

export function getPayrollOrgRegistryAddress(): `0x${string}` {
  return getContractAddresses().PayrollOrgRegistry;
}

export function tokenAddressFor(symbol: SupportedToken): `0x${string}` {
  return TOKEN_CONFIG[symbol].address;
}

export function tokenSymbolForAddress(address: string): SupportedToken | null {
  const lower = address.toLowerCase();
  if (lower === USDC_ADDRESS.toLowerCase()) return "USDC";
  if (lower === EURC_ADDRESS.toLowerCase()) return "EURC";
  return null;
}
