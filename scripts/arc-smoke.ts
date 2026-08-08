/**
 * Arc testnet smoke test — validates RPC, USDC balances, and Circle APIs.
 *
 * Run: npm run arc:smoke
 */

import * as dotenv from "dotenv";
import * as fs     from "fs";
import * as path   from "path";
import { createPublicClient, http, formatUnits } from "viem";
import {
  ARC_CHAIN_ID,
  ARC_RPC_URL,
  USDC_ADDRESS,
  EURC_ADDRESS,
  TOKEN_DECIMALS,
  FUNDED_ROLES_REQUIRED,
  type AccountRole,
} from "../config/arc.testnet";
import {
  assertArcTestnet,
  pingWalletsApi,
  createTestWallet,
  validateCctpBridgeKitConfig,
  checkStableFxAccess,
} from "../circle/src";

dotenv.config();

const ERC20_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs:  [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

interface AccountsFile {
  network: string;
  chainId: number;
  accounts: Partial<Record<AccountRole, string>>;
}

async function main(): Promise<void> {
  console.log("=== Arcittance Arc Smoke Test ===\n");

  // 1. Network guard
  assertArcTestnet();
  console.log("✓ ARC_NETWORK = arc:testnet");

  // 2. RPC + chain ID
  const client = createPublicClient({
    transport: http(ARC_RPC_URL),
  });
  const chainId = await client.getChainId();
  if (chainId !== ARC_CHAIN_ID) {
    throw new Error(`Wrong chain ID: expected ${ARC_CHAIN_ID}, got ${chainId}`);
  }
  console.log(`✓ RPC connected — chain ID ${chainId}`);

  // 3. Account balances
  const accountsPath = path.join(__dirname, "../config/accounts.testnet.json");
  if (!fs.existsSync(accountsPath)) {
    throw new Error("config/accounts.testnet.json not found — run npm run provision:accounts first");
  }
  const accountsFile = JSON.parse(fs.readFileSync(accountsPath, "utf8")) as AccountsFile;

  console.log("\n--- Account balances (USDC / EURC) ---");
  for (const [role, address] of Object.entries(accountsFile.accounts)) {
    if (!address) continue;
    const usdc = await client.readContract({
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [address as `0x${string}`],
    });
    const eurc = await client.readContract({
      address: EURC_ADDRESS,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [address as `0x${string}`],
    });
    const usdcFmt = formatUnits(usdc, TOKEN_DECIMALS);
    const eurcFmt = formatUnits(eurc, TOKEN_DECIMALS);
    console.log(`  ${role}: USDC=${usdcFmt} EURC=${eurcFmt} (${address})`);

    if (FUNDED_ROLES_REQUIRED.includes(role as AccountRole) && usdc === 0n) {
      throw new Error(
        `${role} has zero USDC — fund via https://faucet.circle.com (Arc Testnet)`
      );
    }
  }
  console.log("✓ Required accounts funded");

  // 4. Circle Wallets
  await pingWalletsApi();
  console.log("✓ Circle Wallets API ping");

  const wallet = await createTestWallet();
  console.log(`✓ Circle Wallets create test wallet: ${wallet.address} (${wallet.walletId})`);

  // 5. CCTP / Bridge Kit config
  const cctp = validateCctpBridgeKitConfig();
  console.log(`✓ CCTP Bridge Kit config valid (arcDomain=${cctp.arcDomain})`);

  // 6. StableFX (pending OK)
  const sfx = checkStableFxAccess();
  console.log(`  StableFX: ${sfx.message}`);

  // 7. Facilitator wallet (Phase 3)
  const facilitatorId = process.env.CIRCLE_FACILITATOR_WALLET_ID?.trim();
  if (facilitatorId) {
    const { getDeveloperClient, getWalletUsdcBalance } = await import("../circle/src/developer-client");
    const client = getDeveloperClient();
    const w = await client.getWallet({ id: facilitatorId });
    const bal = await getWalletUsdcBalance(facilitatorId);
    console.log(`✓ Facilitator wallet ${w.data?.wallet?.address} — USDC ${bal}`);
  } else {
    console.log("  Facilitator wallet: not configured (run npm run configure:circle-wallets)");
  }

  console.log("\n=== Smoke test PASSED ===");
  console.log("\nDeferred (documented): Arc mainnet; StableFX production LIVE key (sandbox wired in Phase 10)");
}

main().catch(err => {
  console.error("\nSmoke test FAILED:", err.message ?? err);
  process.exit(1);
});
