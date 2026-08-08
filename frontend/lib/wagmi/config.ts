// frontend/lib/wagmi/config.ts
/**
 * Wagmi + viem configuration for Arcittance on Arc testnet.
 * Chain ID: 5042002 — gas denominated in USDC.
 */

import { createConfig, http } from "wagmi";
import { defineChain }        from "viem";
import { injected, metaMask } from "wagmi/connectors";

export const arcTestnet = defineChain({
  id:   5042002,
  name: "Arc Testnet",
  nativeCurrency: {
    name:     "USDC",
    symbol:   "USDC",
    decimals: 6,
  },
  rpcUrls: {
    default: {
      http:      [process.env.NEXT_PUBLIC_ARC_RPC_URL || "https://rpc.testnet.arc.io"],
      webSocket: [process.env.NEXT_PUBLIC_ARC_WS_URL  || "wss://rpc.testnet.arc.io"],
    },
  },
  blockExplorers: {
    default: {
      name: "Arcscan",
      url:  "https://testnet.arcscan.app",
    },
  },
  testnet: true,
});

export const wagmiConfig = createConfig({
  chains:     [arcTestnet],
  connectors: [
    injected(),
    metaMask(),
  ],
  transports: {
    [arcTestnet.id]: http(
      process.env.NEXT_PUBLIC_ARC_RPC_URL || "https://rpc.testnet.arc.io"
    ),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
