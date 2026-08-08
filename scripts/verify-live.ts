/**
 * Live verification: seed vault, developer keeper payroll, CCTP, user wallet, gas sponsorship.
 * Run: npm run verify:live
 */

import * as dotenv from "dotenv";
import * as fs from "fs";
import { requirePayrollVaultAddress } from "./lib/resolve-payroll-vault";
import * as path from "path";
import { ethers } from "ethers";
import {
  runPayrollViaCircle,
  getWalletUsdcBalance,
  executeContractCall,
} from "../circle/src/developer-client";
import { payEmployeeCrossChain } from "../circle/src/cctp-client";
import { initiateUserTransfer } from "../circle/src/user-client";
import { sponsorTransactionFee } from "../circle/src/gas-station";
import { BASE_SEPOLIA_CCTP_DOMAIN, BASE_SEPOLIA_RPC_URL, BASE_SEPOLIA_USDC } from "../config/arc.testnet";

dotenv.config();

const USDC = "0x3600000000000000000000000000000000000000";
const results: { name: string; ok: boolean; detail: string }[] = [];

function record(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}: ${detail}`);
}

async function seedVaultForKeeper(vaultAddr: string): Promise<void> {
  const provider = new ethers.JsonRpcProvider(process.env.ARC_RPC_URL);
  const deployer = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY!, provider);
  const keeper = new ethers.Wallet(process.env.KEEPER_PRIVATE_KEY!, provider);
  const employee = ethers.Wallet.createRandom().connect(provider);

  const salary = ethers.parseUnits("0.01", 6);
  const usdc = new ethers.Contract(USDC, [
    "function approve(address,uint256) returns (bool)",
    "function balanceOf(address) view returns (uint256)",
  ], deployer);

  const vault = new ethers.Contract(vaultAddr, [
    "function deposit(address,uint256)",
    "function registerEmployee(address,uint256,address,uint256,uint256,uint32,uint8,uint8) returns (uint256)",
    "function runPayroll()",
    "function employeeCount() view returns (uint256)",
  ], deployer) as ethers.Contract & {
    deposit(token: string, amount: bigint): Promise<ethers.ContractTransactionResponse>;
    registerEmployee(...args: unknown[]): Promise<ethers.ContractTransactionResponse>;
    runPayroll(): Promise<ethers.ContractTransactionResponse>;
  };

  const bal = await usdc.balanceOf(deployer.address);
  if (bal < salary * 3n) throw new Error(`Deployer USDC too low: ${ethers.formatUnits(bal, 6)}`);

  await (await usdc.approve(vaultAddr, salary * 3n)).wait();
  await (await vault.deposit(USDC, salary * 3n)).wait();
  await (await vault.registerEmployee(
    employee.address, salary, USDC, 86400n, salary * 12n, 0, 0, 0
  )).wait();

  const before = await usdc.balanceOf(employee.address) as bigint;
  const vaultAsKeeper = vault.connect(keeper) as typeof vault;
  await (await vaultAsKeeper.runPayroll()).wait();
  const after = await usdc.balanceOf(employee.address) as bigint;

  if (after - before !== salary) {
    throw new Error("Private-key keeper payroll did not pay employee");
  }
  record("seed-vault (arc-local payroll)", true, `paid ${ethers.formatUnits(salary, 6)} USDC to ${employee.address}`);
}

async function verifyDeveloperKeeper(vaultAddr: string, walletId: string): Promise<void> {
  const provider = new ethers.JsonRpcProvider(process.env.ARC_RPC_URL);
  const deployer = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY!, provider);
  const employee = ethers.Wallet.createRandom().connect(provider);
  const salary = ethers.parseUnits("0.01", 6);

  const usdc = new ethers.Contract(USDC, [
    "function approve(address,uint256) returns (bool)",
    "function balanceOf(address) view returns (uint256)",
  ], deployer);

  const vault = new ethers.Contract(vaultAddr, [
    "function deposit(address,uint256)",
    "function registerEmployee(address,uint256,address,uint256,uint256,uint32,uint8,uint8) returns (uint256)",
  ], deployer);

  await (await usdc.approve(vaultAddr, salary * 2n)).wait();
  await (await vault.deposit(USDC, salary * 2n)).wait();
  await (await vault.registerEmployee(
    employee.address, salary, USDC, 86400n, salary * 12n, 0, 0, 0
  )).wait();

  const before = await usdc.balanceOf(employee.address) as bigint;
  const result = await runPayrollViaCircle(walletId, vaultAddr);

  if (result.state !== "COMPLETE" && result.state !== "CONFIRMED") {
    record("developer-controlled keeper", false, `Circle state=${result.state}`);
    return;
  }

  if (!result.txHash) {
    record("developer-controlled keeper", false, "No txHash returned");
    return;
  }

  await new Promise((r) => setTimeout(r, 5000));
  const after = await usdc.balanceOf(employee.address) as bigint;
  const paid = after - before === salary;

  record(
    "developer-controlled keeper",
    paid,
    `state=${result.state} tx=${result.txHash} employeePaid=${paid}`
  );
}

async function verifyCctpBridge(): Promise<void> {
  const recipient = ethers.Wallet.createRandom();
  const amount = "0.1";

  const baseProvider = new ethers.JsonRpcProvider(BASE_SEPOLIA_RPC_URL);
  const baseUsdc = new ethers.Contract(BASE_SEPOLIA_USDC, [
    "function balanceOf(address) view returns (uint256)",
  ], baseProvider);

  const before = await baseUsdc.balanceOf(recipient.address);

  const bridge = await payEmployeeCrossChain({
    employeeAddress:  recipient.address,
    amountUsdc:       amount,
    destinationChain: "Base_Sepolia",
    speed:            "standard",
    onProgress:       (step, detail) => console.log(`  [cctp] ${step}: ${detail ?? ""}`),
  });

  if (bridge.state === "error") {
    record("CCTP bridge (Bridge Kit forwarder)", false, "bridge state=error");
    return;
  }

  const timeout = Date.now() + 180_000;
  while (Date.now() < timeout) {
    const after = await baseUsdc.balanceOf(recipient.address);
    if (after > before) {
      record(
        "CCTP bridge (Bridge Kit forwarder)",
        true,
        `minted on Base Sepolia to ${recipient.address}`
      );
      return;
    }
    await new Promise((r) => setTimeout(r, 5_000));
  }

  record(
    "CCTP bridge (Bridge Kit forwarder)",
    false,
    `submitted but no Base mint within 3min (state=${bridge.state})`
  );
}

async function verifyOnChainCctpRouter(vaultAddr: string): Promise<void> {
  const provider = new ethers.JsonRpcProvider(process.env.ARC_RPC_URL);
  const deployer = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY!, provider);
  const keeper = new ethers.Wallet(process.env.KEEPER_PRIVATE_KEY!, provider);
  const recipient = ethers.Wallet.createRandom();
  const salary = ethers.parseUnits("0.1", 6);

  const addresses = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../deployments/arc/addresses.json"), "utf8")
  ) as { contracts: { CrossChainRouter: string } };

  const baseProvider = new ethers.JsonRpcProvider(BASE_SEPOLIA_RPC_URL);
  const baseUsdc = new ethers.Contract(BASE_SEPOLIA_USDC, [
    "function balanceOf(address) view returns (uint256)",
  ], baseProvider);

  const vault = new ethers.Contract(vaultAddr, [
    "function employeeCount() view returns (uint256)",
    "function getEmployee(uint256) view returns (tuple(address wallet,uint256 salaryAmount,address payToken,uint256 payInterval,uint256 nextPaymentDue,uint256 approvedCap,uint32 destinationChainId,uint8 routingMethod,uint8 transferSpeed,bool active))",
    "function deposit(address,uint256)",
    "function registerEmployee(address,uint256,address,uint256,uint256,uint32,uint8,uint8) returns (uint256)",
    "function deactivateEmployee(uint256)",
    "function runPayroll()",
  ], deployer) as ethers.Contract & {
    deposit(token: string, amount: bigint): Promise<ethers.ContractTransactionResponse>;
    registerEmployee(...args: unknown[]): Promise<ethers.ContractTransactionResponse>;
    deactivateEmployee(id: number): Promise<ethers.ContractTransactionResponse>;
    runPayroll(): Promise<ethers.ContractTransactionResponse>;
  };

  const count = Number(await vault.employeeCount());
  for (let i = 0; i < count; i++) {
    const emp = await vault.getEmployee(i);
    if (emp.active) {
      await (await vault.deactivateEmployee(i)).wait();
    }
  }

  const usdc = new ethers.Contract(USDC, [
    "function approve(address,uint256) returns (bool)",
  ], deployer);

  await (await usdc.approve(vaultAddr, salary * 2n)).wait();
  await (await vault.deposit(USDC, salary * 2n)).wait();
  await (await vault.registerEmployee(
    recipient.address, salary, USDC, 86400n, salary * 12n,
    BASE_SEPOLIA_CCTP_DOMAIN, 0, 0
  )).wait();

  const beforeBase = await baseUsdc.balanceOf(recipient.address) as bigint;

  try {
    const vaultAsKeeper = vault.connect(keeper) as typeof vault;
    const tx = await vaultAsKeeper.runPayroll();
    const receipt = await tx.wait();
    const routerAddr = addresses.contracts.CrossChainRouter;
    const routeLog = receipt?.logs.find((log) =>
      log.address.toLowerCase() === routerAddr.toLowerCase()
    );

    if (!routeLog) {
      record("on-chain routeCCTP (PayrollVault)", false, "No RouteCCTP event in receipt");
      return;
    }

    const { orchestratePayrollCrossChain } = await import("../circle/src/cross-chain-orchestrator");
    const orch = await orchestratePayrollCrossChain({
      vaultAddress: vaultAddr,
      payrollTxHash: receipt!.hash,
      routerAddress: routerAddr,
    });

    const afterBase = await baseUsdc.balanceOf(recipient.address) as bigint;
    const minted = afterBase > beforeBase;
    const cctpOk = orch.cctpCompletions.some((c) => c.confirmed) || minted;

    record(
      "on-chain routeCCTP (PayrollVault)",
      receipt?.status === 1 && !!routeLog && cctpOk,
      `tx=${receipt?.hash} baseMint=${minted} orch=${orch.cctpCompletions.length}`
    );
  } catch (e: any) {
    record("on-chain routeCCTP (PayrollVault)", false, e.shortMessage ?? e.message);
  }
}

async function verifyGasSponsorshipDev(walletId: string): Promise<void> {
  const fee = sponsorTransactionFee();
  const vaultAddr = requirePayrollVaultAddress();

  const result = await executeContractCall({
    walletId,
    contractAddress:      vaultAddr,
    abiFunctionSignature: "employeeCount()",
  });

  record(
    "gas sponsorship (developer read call)",
    result.state === "COMPLETE" || result.state === "CONFIRMED",
    `feeLevel=${fee.config.feeLevel} state=${result.state}`
  );
}

async function verifyUserWalletTransfer(): Promise<void> {
  const userId = process.env.REMIT_TEST_USER_ID;
  const otp = process.env.REMIT_TEST_OTP;

  if (!userId) {
    record(
      "user-controlled wallet + gas sponsorship",
      false,
      "Set REMIT_TEST_USER_ID (run: npm run provision:remit-user after /remit OTP)"
    );
    return;
  }

  const { acquireUserToken, acquireUserTokenPin, listUserWallets } = await import(
    "../circle/src/user-client"
  );
  const session = otp
    ? await acquireUserToken(userId, otp)
    : await acquireUserTokenPin(userId);

  let walletId = process.env.REMIT_TEST_WALLET_ID;
  let address = process.env.REMIT_TEST_WALLET_ADDRESS;
  if (!walletId || !address) {
    const wallets = await listUserWallets(session.userToken);
    if (wallets.length === 0) {
      record(
        "user-controlled wallet + gas sponsorship",
        false,
        "No user wallet — complete /remit OTP once"
      );
      return;
    }
    walletId = wallets[0].walletId;
    address = wallets[0].address;
  }

  const { getFacilitatorEoaAddress } = await import("../circle/src/wallet-adapters");
  const facilitator = getFacilitatorEoaAddress();
  const transfer = await initiateUserTransfer({
    userToken:          session.userToken,
    walletId:           walletId!,
    destinationAddress: facilitator,
    amountUsdc:         "10000",
  });

  record(
    "user-controlled wallet + gas sponsorship",
    !!transfer.transactionId,
    `txId=${transfer.transactionId} state=${transfer.state} from=${address}`
  );
}

async function main(): Promise<void> {
  console.log("=== Live Phase 3-5 Verification ===\n");

  const walletId = process.env.CIRCLE_FACILITATOR_WALLET_ID;
  if (!walletId) throw new Error("CIRCLE_FACILITATOR_WALLET_ID required");

  const vault = requirePayrollVaultAddress();
  const bal = await getWalletUsdcBalance(walletId);
  console.log(`Facilitator USDC: ${bal}\n`);

  await seedVaultForKeeper(vault);
  await verifyDeveloperKeeper(vault, walletId);
  await verifyGasSponsorshipDev(walletId);
  await verifyOnChainCctpRouter(vault);

  try {
    await verifyCctpBridge();
  } catch (e: any) {
    record("CCTP bridge (Bridge Kit)", false, e.message ?? String(e));
  }

  await verifyUserWalletTransfer();

  console.log("\n=== Summary ===");
  const passed = results.filter((r) => r.ok).length;
  console.log(`${passed}/${results.length} checks passed`);
  for (const r of results) {
    console.log(`  ${r.ok ? "✓" : "✗"} ${r.name}`);
  }

  if (passed < results.length) process.exit(1);
}

main().catch((e) => {
  console.error("verify:live FAILED:", e.message ?? e);
  process.exit(1);
});
