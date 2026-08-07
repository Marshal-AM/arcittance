/**
 * CCTP destination domain mapping for Arcittance cross-chain routing.
 *
 * `domain` is the PayrollVault / RemittanceVault destinationChainId.
 * Arc-local uses 0; every cross-chain destination must be > 0 (router require).
 */

export interface CctpDestination {
  domain: number;
  chainId: number;
  bridgeKitName: string;
  circleChainId: string;
  label: string;
  country: string;
  /** Block explorer origin (no trailing slash) for destination mint/spend txs */
  explorerBase: string;
  /** Native USDC on the destination chain (for mint confirmation polls) */
  usdcAddress: string;
}

export const CCTP_DESTINATIONS: CctpDestination[] = [
  {
    domain: 3,
    chainId: 421614,
    bridgeKitName: "Arbitrum_Sepolia",
    circleChainId: "ARB-SEPOLIA",
    label: "Arbitrum Sepolia",
    country: "UAE corridor (demo)",
    explorerBase: "https://sepolia.arbiscan.io",
    usdcAddress: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
  },
  {
    domain: 1,
    chainId: 43113,
    bridgeKitName: "Avalanche_Fuji",
    circleChainId: "AVAX-FUJI",
    label: "Avalanche Fuji",
    country: "UAE corridor (demo)",
    explorerBase: "https://testnet.snowtrace.io",
    usdcAddress: "0x5425890298aed601595a70AB815c96711a31Bc65",
  },
  {
    domain: 6,
    chainId: 84532,
    bridgeKitName: "Base_Sepolia",
    circleChainId: "BASE-SEPOLIA",
    label: "Base Sepolia",
    country: "UAE corridor (demo)",
    explorerBase: "https://sepolia.basescan.org",
    usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  },
];

export const ARC_LOCAL_DOMAIN = 0; // destinationChainId 0 in PayrollVault = Arc-local

export function getDestinationByDomain(domain: number): CctpDestination | undefined {
  return CCTP_DESTINATIONS.find((d) => d.domain === domain);
}

export function getDestinationLabel(domain: number): string {
  if (domain === ARC_LOCAL_DOMAIN) return "Arc (local)";
  return getDestinationByDomain(domain)?.label ?? `CCTP domain ${domain}`;
}
