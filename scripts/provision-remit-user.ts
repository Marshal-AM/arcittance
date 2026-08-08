/**
 * Provision or resume a remittance test user for live CLI tests.
 *
 * Email OTP (recommended — matches /remit UI):
 *   1. REMIT_TEST_EMAIL=you@example.com npm run provision:remit-user
 *   2. Complete OTP in browser at http://localhost:3000/remit
 *   3. Add printed REMIT_TEST_* vars to .env
 *   4. npm run test:remittance -- --live
 *
 * Resume existing user (after /remit wallet exists):
 *   REMIT_TEST_USER_ID=... npm run provision:remit-user
 */

import * as dotenv from "dotenv";
import { randomUUID } from "crypto";
import { ethers } from "ethers";
import {
  acquireUserToken,
  acquireUserTokenPin,
  createUser,
  createUserWallet,
  listUserWallets,
  requestEmailOtp,
} from "../circle/src/user-client";
import { ARC_RPC_URL, USDC_ADDRESS } from "../config/arc.testnet";

dotenv.config();

const USDC_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address,uint256) returns (bool)",
];

async function fundWallet(address: string, amountUsdc = "1"): Promise<void> {
  const pk = process.env.DEPLOYER_PRIVATE_KEY;
  if (!pk) {
    console.log("  (skip fund — DEPLOYER_PRIVATE_KEY not set)");
    return;
  }

  const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);
  const deployer = new ethers.Wallet(
    pk.startsWith("0x") ? pk : `0x${pk}`,
    provider
  );
  const usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, deployer);
  const amount = ethers.parseUnits(amountUsdc, 6);
  const bal: bigint = await usdc.balanceOf(deployer.address);
  if (bal < amount) {
    console.log(`  Deployer USDC low (${ethers.formatUnits(bal, 6)}) — fund via faucet`);
    return;
  }
  const tx = await usdc.transfer(address, amount);
  await tx.wait();
  console.log(`  Funded ${address} with ${amountUsdc} USDC`);
}

async function main(): Promise<void> {
  console.log("=== Provision Remit Test User ===\n");

  const email = process.env.REMIT_TEST_EMAIL;
  const existingUserId = process.env.REMIT_TEST_USER_ID;
  const otp = process.env.REMIT_TEST_OTP;

  if (email && !existingUserId) {
    const deviceId = process.env.REMIT_TEST_DEVICE_ID ?? randomUUID();
    console.log(`Requesting email OTP for ${email}…`);
    const otpSession = await requestEmailOtp(email, deviceId);
    console.log("\nOTP requested. Complete verification in the /remit UI:");
    console.log("  1. cd frontend && npm run dev");
    console.log("  2. Open http://localhost:3000/remit");
    console.log("  3. Enter the same email and OTP from your inbox");
  console.log("\nAfter wallet is created, add to .env:");
    console.log(`  REMIT_TEST_DEVICE_ID=${deviceId}`);
    console.log("  REMIT_TEST_USER_ID=<from browser devtools or session response>");
    console.log("  REMIT_TEST_OTP=<fresh OTP when re-running CLI tests>");
    console.log("\nDevice tokens (for Web SDK if needed):");
    console.log(`  deviceToken=${otpSession.deviceToken.slice(0, 20)}…`);
    return;
  }

  const userId = existingUserId;
  if (!userId) {
    const created = await createUser("cli-test@example.com");
    console.log("Created PIN user (wallet requires /remit Web SDK PIN setup):");
    console.log(`  REMIT_TEST_USER_ID=${created.userId}`);
    console.log("\nFor live CLI tests, use email OTP via REMIT_TEST_EMAIL instead.");
    return;
  }

  let session;
  if (otp) {
    session = await acquireUserToken(userId, otp);
    console.log("✓ User token acquired (email OTP)");
  } else {
    session = await acquireUserTokenPin(userId);
    console.log("✓ User token acquired (PIN mode — user must have wallet from /remit)");
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
        console.log("\nNo wallet found. Complete one-time setup:");
        console.log("  REMIT_TEST_EMAIL=you@example.com npm run provision:remit-user");
        console.log("  Then finish OTP at http://localhost:3000/remit");
        process.exit(1);
      }
    } else {
      walletId = wallets[0].walletId;
      address = wallets[0].address;
    }
  }

  console.log(`\nWallet: ${address}`);
  console.log(`Wallet ID: ${walletId}`);

  const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);
  const usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, provider);
  const before: bigint = await usdc.balanceOf(address!);
  console.log(`USDC balance: ${ethers.formatUnits(before, 6)}`);

  if (before < ethers.parseUnits("0.05", 6)) {
    console.log("\nFunding test wallet from deployer…");
    await fundWallet(address!, "0.5");
  }

  console.log("\nAdd to .env for npm run test:remittance -- --live:");
  console.log(`REMIT_TEST_USER_ID=${userId}`);
  if (otp) console.log(`REMIT_TEST_OTP=${otp}`);
  console.log(`REMIT_TEST_WALLET_ID=${walletId}`);
  console.log(`REMIT_TEST_WALLET_ADDRESS=${address}`);
}

main().catch((err) => {
  console.error("provision:remit-user FAILED:", err.message ?? err);
  process.exit(1);
});
