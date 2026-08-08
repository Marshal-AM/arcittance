/**
 * Single focused CCTP bridge test (Arc → Base Sepolia) with step-by-step logging.
 * Follows https://docs.arc.io/integrate/exchanges/cctp-bridging outbound flow.
 *
 * Run: npm run test:cctp-bridge
 *
 * Prerequisites:
 * - FACILITATOR_PRIVATE_KEY funded with Arc USDC (burn on Arc)
 * - Circle Orbit relayer handles destination mint (no Base ETH required)
 *
 * Optional env:
 *   CCTP_BRIDGE_AMOUNT=0.1   (default 0.1 USDC)
 *   CCTP_BRIDGE_RECIPIENT=0x… (default: random wallet)
 */

import * as dotenv from "dotenv";
import { ethers } from "ethers";
import { bridgeUsdc } from "../circle/src/cctp-client";
import {
  ARC_RPC_URL,
  BASE_SEPOLIA_RPC_URL,
  BASE_SEPOLIA_USDC,
  USDC_ADDRESS,
} from "../config/arc.testnet";

dotenv.config();

function log(step: string, detail?: string): void {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${step}${detail ? ` — ${detail}` : ""}`);
}

async function main(): Promise<void> {
  console.log("=== CCTP Bridge Test (Arc → Base Sepolia) ===\n");

  if (!process.env.FACILITATOR_PRIVATE_KEY) {
    throw new Error("FACILITATOR_PRIVATE_KEY required");
  }

  const amount = process.env.CCTP_BRIDGE_AMOUNT ?? "0.1";
  const recipient = process.env.CCTP_BRIDGE_RECIPIENT ?? ethers.Wallet.createRandom().address;

  const arcProvider = new ethers.JsonRpcProvider(ARC_RPC_URL);
  const baseProvider = new ethers.JsonRpcProvider(BASE_SEPOLIA_RPC_URL);
  const facilitatorPk = process.env.FACILITATOR_PRIVATE_KEY.startsWith("0x")
    ? process.env.FACILITATOR_PRIVATE_KEY
    : `0x${process.env.FACILITATOR_PRIVATE_KEY}`;
  const facilitatorAddr = new ethers.Wallet(facilitatorPk).address;

  const usdcAbi = ["function balanceOf(address) view returns (uint256)"];
  const arcUsdc = new ethers.Contract(USDC_ADDRESS, usdcAbi, arcProvider);
  const baseUsdc = new ethers.Contract(BASE_SEPOLIA_USDC, usdcAbi, baseProvider);

  const arcBalBefore = await arcUsdc.balanceOf(facilitatorAddr);
  const baseBalBefore = await baseUsdc.balanceOf(recipient);

  log("setup", `facilitator ${facilitatorAddr}`);
  log("setup", `recipient  ${recipient}`);
  log("setup", `amount     ${amount} USDC`);
  log("setup", `Arc USDC   ${ethers.formatUnits(arcBalBefore, 6)}`);
  log("setup", `mode       Bridge Kit forwarder (no Base ETH required)`);
  log("setup", `recipient Base USDC before ${ethers.formatUnits(baseBalBefore, 6)}`);

  const needed = ethers.parseUnits(amount, 6);
  if (arcBalBefore < needed) {
    throw new Error(
      `Facilitator Arc USDC ${ethers.formatUnits(arcBalBefore, 6)} < ${amount} required`
    );
  }

  console.log("");
  const started = Date.now();
  const result = await bridgeUsdc({
    fromChain:          "Arc_Testnet",
    toChain:            "Base_Sepolia",
    amount,
    recipientAddress:   recipient,
    attestationTimeoutMs: 180_000,
    onProgress:         (step, detail) => log(step, detail),
  });

  const baseBalAfter = await baseUsdc.balanceOf(recipient);
  const minted = baseBalAfter - baseBalBefore;
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  console.log("\n=== Result ===");
  console.log(`State: ${result.state}`);
  for (const s of result.steps) {
    console.log(`  ${s.state === "success" ? "✓" : "✗"} ${s.name}${s.txHash ? ` ${s.txHash}` : ""}`);
    if (s.explorerUrl) console.log(`    ${s.explorerUrl}`);
  }
  console.log(`Recipient Base USDC: ${ethers.formatUnits(baseBalAfter, 6)} (+${ethers.formatUnits(minted, 6)})`);
  console.log(`Elapsed: ${elapsed}s`);

  if (minted > 0n) {
    console.log("\n✓ CCTP bridge test PASSED — USDC minted to recipient on Base Sepolia");
    if (minted < needed) {
      console.log(`  (received ${ethers.formatUnits(minted, 6)} < ${amount} — relay fee deducted in USDC)`);
    }
    process.exit(0);
  }

  console.log("\n✗ CCTP bridge test FAILED — recipient balance did not increase");
  process.exit(1);
}

main().catch((err) => {
  console.error("\n✗ test:cctp-bridge FAILED:", err.message ?? err);
  process.exit(1);
});
