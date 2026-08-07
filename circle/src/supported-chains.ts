/**
 * Payout destination chains for Circle Stablecoin Payouts (sandbox).
 * Source: docs/phase10.md
 */

export const PAYOUT_SUPPORTED_CHAINS = {
  USDC: [
    "ALGO", "APTOS", "ARB", "ARC", "AVAX", "BASE", "CELO", "CODEX",
    "CRONOS", "EDGE", "ETH", "HBAR", "HYPEREVM", "INJECTIVE", "INK",
    "LINEA", "MONAD", "MORPH", "NEAR", "NOBLE", "OP", "PHAROS", "PLUME",
    "PAH", "POLY", "SEI", "SOL", "SONIC", "STRK", "XLM", "SUI", "UNI",
    "WORLDCHAIN", "XLAYER", "XDC", "XRP", "ZKS",
  ],
  EURC: ["ARC", "AVAX", "BASE", "CRONOS", "ETH", "SOL", "XLM", "WORLDCHAIN"],
} as const;

export type PayoutCurrency = keyof typeof PAYOUT_SUPPORTED_CHAINS;
export type PayoutChain = (typeof PAYOUT_SUPPORTED_CHAINS)[PayoutCurrency][number];

export function getSupportedChains(currency: PayoutCurrency): readonly string[] {
  return PAYOUT_SUPPORTED_CHAINS[currency];
}

export function isChainSupportedForCurrency(
  currency: PayoutCurrency,
  chain: string
): boolean {
  const upper = chain.toUpperCase();
  return (PAYOUT_SUPPORTED_CHAINS[currency] as readonly string[]).includes(upper);
}

export const PAYOUT_CHAIN_LABELS: Record<string, string> = {
  ARC: "Arc Testnet",
  BASE: "Base Sepolia",
  ETH: "Ethereum",
  AVAX: "Avalanche Fuji",
  SOL: "Solana",
  CRONOS: "Cronos",
  XLM: "Stellar",
  WORLDCHAIN: "World Chain",
  ARB: "Arbitrum Sepolia",
  OP: "Optimism",
  POLY: "Polygon",
};

/** Path B · Bank-mock destination chains (Circle Payouts sandbox). */
export const BANK_MOCK_PAYOUT_CHAINS = ["ARC", "BASE", "ARB", "AVAX"] as const;
export type BankMockPayoutChain = (typeof BANK_MOCK_PAYOUT_CHAINS)[number];

export function isBankMockPayoutChain(chain: string): chain is BankMockPayoutChain {
  return (BANK_MOCK_PAYOUT_CHAINS as readonly string[]).includes(chain.toUpperCase());
}

/** Map Circle payout chain code → vault / remittance destinationChainId (CCTP domain). */
export function bankMockChainToDomain(chain: string): number {
  switch (chain.toUpperCase()) {
    case "BASE":
      return 6;
    case "ARB":
      return 3;
    case "AVAX":
      return 1;
    default:
      return 0; // ARC local
  }
}

/** Map vault destinationChainId → Circle payout chain code. */
export function domainToPayoutChain(domain: number): BankMockPayoutChain {
  switch (domain) {
    case 6:
      return "BASE";
    case 3:
      return "ARB";
    case 1:
      return "AVAX";
    default:
      return "ARC";
  }
}
