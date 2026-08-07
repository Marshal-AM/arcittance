import { ARC_NETWORK } from "../../config/arc.testnet";

export interface CircleConfig {
  apiKey: string;
  walletsEntitySecret: string;
  gatewayApiKey: string;
  cctpBridgeKitConfig: string;
  stableFxApiKey: string;
  /** Circle StableFX API host — sandbox default for TEST keys. */
  stableFxBaseUrl: string;
}

export function assertArcTestnet(): void {
  const network = process.env.ARC_NETWORK ?? ARC_NETWORK;
  if (network !== "arc:testnet") {
    throw new Error(
      `ARC_NETWORK must be "arc:testnet" (got "${network}"). Arc mainnet is out of scope.`
    );
  }
}

export function getCircleConfig(): CircleConfig {
  assertArcTestnet();

  const apiKey = process.env.CIRCLE_API_KEY;
  if (!apiKey) throw new Error("CIRCLE_API_KEY is required");

  const walletsEntitySecret = process.env.CIRCLE_WALLETS_ENTITY_SECRET;
  if (!walletsEntitySecret) throw new Error("CIRCLE_WALLETS_ENTITY_SECRET is required");

  const gatewayApiKey = process.env.CIRCLE_GATEWAY_API_KEY ?? "";

  const cctpBridgeKitConfig = process.env.CIRCLE_CCTP_BRIDGEKIT_CONFIG;
  if (!cctpBridgeKitConfig) throw new Error("CIRCLE_CCTP_BRIDGEKIT_CONFIG is required");

  return {
    apiKey,
    walletsEntitySecret,
    gatewayApiKey,
    cctpBridgeKitConfig,
    stableFxApiKey: process.env.CIRCLE_STABLEFX_API_KEY ?? "",
    stableFxBaseUrl:
      process.env.STABLEFX_API_BASE_URL?.replace(/\/$/, "") ||
      "https://api-sandbox.circle.com",
  };
}
