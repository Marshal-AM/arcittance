/**
 * Live test: compliance blocklist + remittance send path.
 * Run: npm run test:remittance
 * Live OTP path: npm run test:remittance -- --live
 *
 * Prerequisites for --live:
 *   npm run provision:remit-user   (or complete /remit OTP once)
 *   REMIT_TEST_USER_ID + REMIT_TEST_WALLET_ID in .env
 *   REMIT_TEST_OTP required for email-auth users; omit for PIN-resume if wallet exists
 */

import * as dotenv from "dotenv";
import { ethers } from "ethers";
import { screenAddress } from "../circle/src/compliance";
import { ARC_RPC_URL, BASE_SEPOLIA_RPC_URL, BASE_SEPOLIA_USDC, USDC_ADDRESS } from "../config/arc.testnet";

dotenv.config();

const RECIPIENT_DEMO = "0x80568CF6687392bD74f15b1C600029499D97Ff40";

async function runComplianceTest(): Promise<void> {
  console.log("=== Remittance compliance test ===\n");

  const allowed = screenAddress(RECIPIENT_DEMO);
  console.log("Recipient demo address:", allowed.allowed ? "ALLOWED" : `BLOCKED: ${allowed.reason}`);
  if (!allowed.allowed) throw new Error("Expected recipient demo to be allowed");

  const blocked = screenAddress("0x000000000000000000000000000000000000dEaD");
  console.log("Dead address:", blocked.allowed ? "ALLOWED" : `BLOCKED: ${blocked.reason}`);
  if (blocked.allowed) throw new Error("Expected dead address to be blocklisted");

  console.log("\n✓ Compliance engine blocklist test passed");
}

async function resolveLiveSession() {
  const {
    acquireUserToken,
    acquireUserTokenPin,
    createUserWallet,
    listUserWallets,
  } = await import("../circle/src/user-client");

  const userId = process.env.REMIT_TEST_USER_ID;
  if (!userId) {
    throw new Error(
      "REMIT_TEST_USER_ID required — run: npm run provision:remit-user"
    );
  }

  const otp = process.env.REMIT_TEST_OTP;
  let session;
  try {
    session = otp
      ? await acquireUserToken(userId, otp)
      : await acquireUserTokenPin(userId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!otp && msg.includes("PIN user token failed")) {
      throw new Error(
        "Email OTP user — set REMIT_TEST_OTP in .env with a fresh code from your inbox, then re-run"
      );
    }
    throw err;
  }

  let walletId = process.env.REMIT_TEST_WALLET_ID;
  let address = process.env.REMIT_TEST_WALLET_ADDRESS;

  if (!walletId || !address) {
    const wallets = await listUserWallets(session.userToken);
    if (wallets.length === 0) {
      if (otp) {
        const wallet = await createUserWallet(session.userToken);
        walletId = wallet.walletId;
        address = wallet.address;
      } else {
        throw new Error(
          "No user wallet — complete /remit OTP once or set REMIT_TEST_WALLET_ID"
        );
      }
    } else {
      walletId = wallets[0].walletId;
      address = wallets[0].address;
    }
  }

  return { session, walletId: walletId!, address: address! };
}

async function runLiveUserWalletTest(): Promise<void> {
  console.log("\n=== Live user-wallet remittance test ===\n");

  const { session, walletId, address } = await resolveLiveSession();
  console.log(`✓ Session ready — wallet ${address}`);

  const { initiateUserTransfer } = await import("../circle/src/user-client");

  const beforeArc = await new ethers.Contract(
    USDC_ADDRESS,
    ["function balanceOf(address) view returns (uint256)"],
    new ethers.JsonRpcProvider(ARC_RPC_URL)
  ).balanceOf(RECIPIENT_DEMO);

  const transfer = await initiateUserTransfer({
    userToken:          session.userToken,
    walletId,
    destinationAddress: RECIPIENT_DEMO,
    amountUsdc:         "0.01",
  });

  console.log(`✓ Sponsored same-chain transfer: ${transfer.transactionId} (${transfer.state})`);

  const arcProvider = new ethers.JsonRpcProvider(ARC_RPC_URL);
  const usdc = new ethers.Contract(
    USDC_ADDRESS,
    ["function balanceOf(address) view returns (uint256)"],
    arcProvider
  );

  const deadline = Date.now() + 120_000;
  let credited = false;
  while (Date.now() < deadline) {
    const after: bigint = await usdc.balanceOf(RECIPIENT_DEMO);
    if (after > beforeArc) {
      credited = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 5_000));
  }

  if (!credited) {
    throw new Error("Same-chain transfer submitted but recipient balance unchanged");
  }
  console.log("✓ Same-chain USDC received on Arc");
}

async function runLiveCrossChainTest(): Promise<void> {
  if (process.env.SKIP_CROSS_CHAIN_REMIT === "1") {
    console.log("\n(skipping cross-chain remit — SKIP_CROSS_CHAIN_REMIT=1)");
    return;
  }

  console.log("\n=== Live user-wallet cross-chain remittance ===\n");

  const { session, walletId } = await resolveLiveSession();
  const { orchestrateCrossChainRemittance } = await import(
    "../circle/src/remittance-orchestrator"
  );

  const baseRecipient = ethers.Wallet.createRandom().address;
  const baseUsdc = new ethers.Contract(
    BASE_SEPOLIA_USDC,
    ["function balanceOf(address) view returns (uint256)"],
    new ethers.JsonRpcProvider(BASE_SEPOLIA_RPC_URL)
  );
  const before: bigint = await baseUsdc.balanceOf(baseRecipient);

  const result = await orchestrateCrossChainRemittance({
    userToken:          session.userToken,
    walletId,
    recipient:          baseRecipient,
    amountUsdc:         "0.1",
    destinationChainId: 6,
    routingMethod:      0,
    transferSpeed:      "standard",
  });

  console.log(`✓ Cross-chain orchestration: ${result.userTransferId} (${result.userTransferState})`);

  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const after: bigint = await baseUsdc.balanceOf(baseRecipient);
    if (after > before) {
      console.log(`✓ Base Sepolia mint: ${ethers.formatUnits(after - before, 6)} USDC → ${baseRecipient}`);
      return;
    }
    await new Promise((r) => setTimeout(r, 5_000));
  }

  throw new Error("Cross-chain remit submitted but Base balance unchanged");
}

async function main(): Promise<void> {
  await runComplianceTest();

  if (process.argv.includes("--live")) {
    await runLiveUserWalletTest();
    await runLiveCrossChainTest();
    console.log("\n✓ Live user-wallet remittance tests passed");
    return;
  }

  console.log("\nFor live user-wallet remittance:");
  console.log("  1. npm run provision:remit-user");
  console.log("  2. npm run test:remittance -- --live");
}

main().catch((err) => {
  console.error("test:remittance FAILED:", err.message ?? err);
  process.exit(1);
});
