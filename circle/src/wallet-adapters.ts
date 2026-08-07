import { createCircleWalletsAdapter } from "@circle-fin/adapter-circle-wallets";
import { createEthersAdapterFromPrivateKey } from "@circle-fin/adapter-ethers-v6";
import { ethers } from "ethers";
import {
  ARC_RPC_URL,
  ARB_SEPOLIA_RPC_URL,
  AVAX_FUJI_RPC_URL,
  BASE_SEPOLIA_RPC_URL,
} from "../../config/arc.testnet";
import { getCircleConfig } from "./config";
import { getDeveloperClient } from "./developer-client";

export interface FacilitatorConfig {
  walletId: string;
}

export type WalletRole = "deployer" | "facilitator";

const ETH_SEPOLIA_RPC_URL =
  process.env.ETH_SEPOLIA_RPC_URL ?? "https://rpc.sepolia.org";

let cachedCircleAdapter: ReturnType<typeof createCircleWalletsAdapter> | null = null;
let cachedFacilitatorAddress: string | null = null;

/** Circle developer-controlled facilitator wallet used by keeper orchestration. */
export function getFacilitatorConfig(): FacilitatorConfig {
  const walletId = process.env.CIRCLE_FACILITATOR_WALLET_ID;
  if (!walletId) {
    throw new Error("CIRCLE_FACILITATOR_WALLET_ID is required");
  }
  return { walletId };
}

/** Server-side Circle Wallets adapter for Bridge Kit + Unified Balance Kit. */
export function getCircleWalletsAdapter() {
  if (!cachedCircleAdapter) {
    const { apiKey, walletsEntitySecret } = getCircleConfig();
    cachedCircleAdapter = createCircleWalletsAdapter({
      apiKey,
      entitySecret: walletsEntitySecret,
    });
  }
  return cachedCircleAdapter;
}

/** Resolve facilitator on-chain address from CIRCLE_FACILITATOR_WALLET_ID. */
export async function getFacilitatorWalletAddress(): Promise<string> {
  if (cachedFacilitatorAddress) return cachedFacilitatorAddress;

  const { walletId } = getFacilitatorConfig();
  const client = getDeveloperClient();
  const resp = await client.getWallet({ id: walletId });
  const address = resp.data?.wallet?.address;
  if (!address) {
    throw new Error(`Facilitator wallet ${walletId} address not found`);
  }

  cachedFacilitatorAddress = address;
  return address;
}

export interface FacilitatorAdapterContext {
  adapter: ReturnType<typeof createCircleWalletsAdapter>;
  walletId: string;
  address: string;
}

/** Facilitator adapter + address for cross-chain kit operations. */
export async function getFacilitatorAdapterContext(): Promise<FacilitatorAdapterContext> {
  const { walletId } = getFacilitatorConfig();
  const adapter = getCircleWalletsAdapter();
  const address = await getFacilitatorWalletAddress();
  return { adapter, walletId, address };
}

function resolvePrivateKey(role: WalletRole): string {
  const raw =
    role === "deployer"
      ? process.env.DEPLOYER_PRIVATE_KEY
      : process.env.FACILITATOR_PRIVATE_KEY ?? process.env.DEPLOYER_PRIVATE_KEY;

  if (!raw) {
    throw new Error(
      role === "deployer"
        ? "DEPLOYER_PRIVATE_KEY is required"
        : "FACILITATOR_PRIVATE_KEY or DEPLOYER_PRIVATE_KEY is required"
    );
  }

  return raw.startsWith("0x") ? raw : `0x${raw}`;
}

/** Resolve Bridge Kit / unified-balance-kit chain name to RPC URL. */
export function getChainRpcUrl(chain: { name?: string; chain?: string }): string {
  const rpcMap: Record<string, string> = {
    Arc_Testnet: ARC_RPC_URL,
    "Arc Testnet": ARC_RPC_URL,
    Base_Sepolia: BASE_SEPOLIA_RPC_URL,
    "Base Sepolia": BASE_SEPOLIA_RPC_URL,
    Ethereum_Sepolia: ETH_SEPOLIA_RPC_URL,
    "Ethereum Sepolia": ETH_SEPOLIA_RPC_URL,
    Arbitrum_Sepolia: ARB_SEPOLIA_RPC_URL,
    "Arbitrum Sepolia": ARB_SEPOLIA_RPC_URL,
    Avalanche_Fuji: AVAX_FUJI_RPC_URL,
    "Avalanche Fuji": AVAX_FUJI_RPC_URL,
  };

  const key = chain.name ?? chain.chain ?? "";
  const rpcUrl = rpcMap[key];
  if (!rpcUrl) {
    throw new Error(`RPC not configured for chain: ${key || "unknown"}`);
  }
  return rpcUrl;
}

/**
 * Legacy private-key adapter — fallback for local scripts only.
 * Production orchestration uses getFacilitatorAdapterContext().
 */
export function getEthersAdapterFromPrivateKey(role: WalletRole = "facilitator") {
  const privateKey = resolvePrivateKey(role);

  return createEthersAdapterFromPrivateKey({
    privateKey,
    getProvider: ({ chain }) => new ethers.JsonRpcProvider(getChainRpcUrl(chain)),
  });
}

/** Raw ethers Wallet for scripts that cannot use Circle Wallets API. */
export function getEthersWallet(
  role: WalletRole = "facilitator",
  provider?: ethers.Provider
): ethers.Wallet {
  return new ethers.Wallet(resolvePrivateKey(role), provider);
}

/** Facilitator EOA — CCTP burns and payroll routeCCTP forwards land here. */
export function getFacilitatorEoaAddress(): string {
  return getEthersWallet("facilitator").address;
}
