/**
 * Arc Testnet constants — single source of truth for V1.
 * Network: arc:testnet only. Arc mainnet is explicitly out of scope.
 */

export const ARC_NETWORK = "arc:testnet" as const;

export const ARC_CHAIN_ID = 5042002;

export const ARC_RPC_URL =
  process.env.ARC_RPC_URL ?? "https://rpc.testnet.arc.io";

export const ARC_WS_URL =
  process.env.ARC_WS_URL ?? "wss://rpc.testnet.arc.io";

export const ARC_EXPLORER_URL = "https://testnet.arcscan.app";

/** USDC ERC-20 interface (6 decimals) — use for balances, transfers, allowances */
export const USDC_ADDRESS =
  "0x3600000000000000000000000000000000000000" as const;

/** EURC on Arc testnet (6 decimals) */
export const EURC_ADDRESS =
  "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a" as const;

/** USDC and EURC use 6 decimals on Arc */
export const TOKEN_DECIMALS = 6;

/** Circle CCTP domain for Arc testnet */
export const ARC_CCTP_DOMAIN = 26;

/** Circle CCTP TokenMessengerV2 on Arc testnet */
export const ARC_TOKEN_MESSENGER =
  "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA" as const;

export const ARC_MESSAGE_TRANSMITTER =
  "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275" as const;

/** Base Sepolia RPC for cross-chain integration tests */
export const BASE_SEPOLIA_RPC_URL =
  process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org";

export const BASE_SEPOLIA_CHAIN_ID = 84532;

export const BASE_SEPOLIA_USDC =
  "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;

/** CCTP domain for Base Sepolia */
export const BASE_SEPOLIA_CCTP_DOMAIN = 6;

/** Circle CCTP domain for Ethereum Sepolia (not offered in payroll UI). */
export const ETH_SEPOLIA_CCTP_DOMAIN = 0;

export const ETH_SEPOLIA_USDC =
  process.env.ETH_SEPOLIA_USDC_ADDRESS ??
  "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";

/** Arbitrum Sepolia — CCTP domain 3 */
export const ARB_SEPOLIA_RPC_URL =
  process.env.ARB_SEPOLIA_RPC_URL ?? "https://sepolia-rollup.arbitrum.io/rpc";

export const ARB_SEPOLIA_CHAIN_ID = 421614;

export const ARB_SEPOLIA_CCTP_DOMAIN = 3;

export const ARB_SEPOLIA_USDC =
  process.env.ARB_SEPOLIA_USDC_ADDRESS ??
  "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d";

/** Avalanche Fuji — CCTP domain 1 */
export const AVAX_FUJI_RPC_URL =
  process.env.AVAX_FUJI_RPC_URL ??
  "https://api.avax-test.network/ext/bc/C/rpc";

export const AVAX_FUJI_CHAIN_ID = 43113;

export const AVAX_FUJI_CCTP_DOMAIN = 1;

export const AVAX_FUJI_USDC =
  process.env.AVAX_FUJI_USDC_ADDRESS ??
  "0x5425890298aed601595a70AB815c96711a31Bc65";

export const BASE_SEPOLIA_MESSAGE_TRANSMITTER =
  "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275" as const;

/** CCTP MessageTransmitterV2 — shared address on Sepolia / Fuji testnets */
export const ETH_SEPOLIA_MESSAGE_TRANSMITTER =
  "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275" as const;

export const ARB_SEPOLIA_MESSAGE_TRANSMITTER =
  "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275" as const;

export const AVAX_FUJI_MESSAGE_TRANSMITTER =
  "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275" as const;

/** Arc CCTP V2 minFinalityThreshold for outbound burns (Arc testnet fast path). */
export const CCTP_MIN_FINALITY_THRESHOLD = 1000;

/** Circle Iris attestation API (per Arc CCTP bridging guide). */
export const IRIS_ATTESTATION_API = "https://iris-api.circle.com/v2/attestations";

/** Circle Iris messages API (fallback when parsing burn logs). */
export const IRIS_MESSAGES_API = "https://iris-api.circle.com/v2/messages";

/** MessageSent(bytes message) topic — Arc CCTP bridging guide. */
export const CCTP_MESSAGE_SENT_TOPIC =
  "0x2fa9ca894982930190727e75500a97d8dc500233a5065e0f3126c48fbe0343c0";

export const ACCOUNT_ROLES = [
  "Arcittance-deployer",
  "Arcittance-keeper",
  "Arcittance-treasury",
  "Arcittance-facilitator",
  "Arcittance-employer-demo",
  "Arcittance-remit-sender-demo",
  "Arcittance-recipient-demo",
] as const;

export type AccountRole = (typeof ACCOUNT_ROLES)[number];

export const ROLE_ENV_KEYS: Record<AccountRole, string> = {
  "Arcittance-deployer":          "DEPLOYER_PRIVATE_KEY",
  "Arcittance-keeper":            "KEEPER_PRIVATE_KEY",
  "Arcittance-treasury":          "TREASURY_PRIVATE_KEY",
  "Arcittance-facilitator":       "FACILITATOR_PRIVATE_KEY",
  "Arcittance-employer-demo":     "EMPLOYER_DEMO_PRIVATE_KEY",
  "Arcittance-remit-sender-demo": "REMIT_SENDER_DEMO_PRIVATE_KEY",
  "Arcittance-recipient-demo":    "RECIPIENT_DEMO_PRIVATE_KEY",
};

/** Roles that must have non-zero USDC before smoke passes */
export const FUNDED_ROLES_REQUIRED: AccountRole[] = [
  "Arcittance-deployer",
  "Arcittance-keeper",
  "Arcittance-facilitator",
];
