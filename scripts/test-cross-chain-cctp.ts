/**
 * Live test: CCTP cross-chain payroll Arc → Base Sepolia.
 * Run: npm run test:cross-chain-cctp
 */

import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { ethers } from "ethers";
import {
  BASE_SEPOLIA_CCTP_DOMAIN,
  BASE_SEPOLIA_RPC_URL,
  BASE_SEPOLIA_USDC,
} from "../config/arc.testnet";

import { requirePayrollVaultAddress } from "./lib/resolve-payroll-vault";

dotenv.config();

const USDC = "0x3600000000000000000000000000000000000000";

type VaultContract = ethers.Contract & {
  employeeCount(): Promise<bigint>;
  getEmployee(id: number): Promise<{ active: boolean }>;
  deactivateEmployee(id: number): Promise<ethers.ContractTransactionResponse>;
  deposit(token: string, amount: bigint): Promise<ethers.ContractTransactionResponse>;
  registerEmployee(...args: unknown[]): Promise<ethers.ContractTransactionResponse>;
  runPayroll(): Promise<ethers.ContractTransactionResponse>;
};

async function deactivateAllEmployees(vault: VaultContract): Promise<number> {
  const count = Number(await vault.employeeCount());
  let deactivated = 0;
  for (let i = 0; i < count; i++) {
    const emp = await vault.getEmployee(i);
    if (!emp.active) continue;
    await (await vault.deactivateEmployee(i)).wait();
    deactivated++;
  }
  return deactivated;
}

async function pollBaseBalance(
  baseUsdc: ethers.Contract,
  recipient: string,
  before: bigint,
  timeoutMs = 60_000
): Promise<bigint> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const after: bigint = await baseUsdc.balanceOf(recipient);
    if (after > before) return after;
    await new Promise((r) => setTimeout(r, 5_000));
  }
  return baseUsdc.balanceOf(recipient);
}

async function main(): Promise<void> {
  const provider = new ethers.JsonRpcProvider(process.env.ARC_RPC_URL);
  const deployer = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY!, provider);
  const keeper = new ethers.Wallet(process.env.KEEPER_PRIVATE_KEY!, provider);

  const addresses = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../deployments/arc/addresses.json"), "utf8")
  ) as {
    contracts: { PayrollVault: string; CrossChainRouter: string };
  };

  const vaultAddr = requirePayrollVaultAddress();
  const routerAddr = addresses.contracts.CrossChainRouter;
  const recipient = ethers.Wallet.createRandom();

  const baseProvider = new ethers.JsonRpcProvider(BASE_SEPOLIA_RPC_URL);
  const baseUsdc = new ethers.Contract(
    BASE_SEPOLIA_USDC,
    ["function balanceOf(address) view returns (uint256)"],
    baseProvider
  );

  const vault = new ethers.Contract(
    vaultAddr,
    [
      "function employeeCount() view returns (uint256)",
      "function getEmployee(uint256) view returns (tuple(address wallet,uint256 salaryAmount,address payToken,uint256 payInterval,uint256 nextPaymentDue,uint256 approvedCap,uint32 destinationChainId,uint8 routingMethod,uint8 transferSpeed,bool active))",
      "function deactivateEmployee(uint256)",
      "function registerEmployee(address,uint256,address,uint256,uint256,uint32,uint8,uint8) returns (uint256)",
      "function runPayroll()",
      "function deposit(address,uint256)",
      "function vaultBalance(address) view returns (uint256)",
    ],
    deployer
  ) as VaultContract;

  const salary = ethers.parseUnits("0.1", 6);
  const usdc = new ethers.Contract(
    USDC,
    [
      "function approve(address,uint256) returns (bool)",
      "function balanceOf(address) view returns (uint256)",
    ],
    deployer
  );

  const deactivated = await deactivateAllEmployees(vault);
  console.log(`Deactivated ${deactivated} existing employee(s)`);

  const depositAmount = salary * 3n;
  await (await usdc.approve(vaultAddr, depositAmount)).wait();
  await (await vault.deposit(USDC, depositAmount)).wait();
  console.log(`Deposited ${ethers.formatUnits(depositAmount, 6)} USDC into vault`);

  await (await vault.registerEmployee(
    recipient.address,
    salary,
    USDC,
    86400,
    salary * 12n,
    BASE_SEPOLIA_CCTP_DOMAIN,
    0,
    0
  )).wait();
  console.log(`Registered cross-chain employee ${recipient.address}`);

  const before = await baseUsdc.balanceOf(recipient.address);
  const vaultAsKeeper = vault.connect(keeper) as VaultContract;
  const payrollTx = await vaultAsKeeper.runPayroll();
  const receipt = await payrollTx.wait();

  if (!receipt || receipt.status !== 1) {
    throw new Error("runPayroll reverted");
  }

  console.log(`On-chain payroll tx: ${receipt.hash}`);
  console.log(`Recipient Base USDC before: ${ethers.formatUnits(before, 6)}`);

  const routeLog = receipt.logs.find(
    (log) => log.address.toLowerCase() === routerAddr.toLowerCase()
  );
  if (!routeLog) {
    throw new Error("No RouteCCTP event — check employee routing config");
  }

  console.log("Running off-chain CCTP bridge (forwarder — no Base ETH needed)…");
  const { orchestratePayrollCrossChain } = await import("../circle/src/cross-chain-orchestrator");
  const orch = await orchestratePayrollCrossChain({
    vaultAddress:  vaultAddr,
    payrollTxHash: receipt.hash,
    routerAddress: routerAddr,
  });

  console.log("Orchestration:", JSON.stringify(orch, null, 2));

  const after = await pollBaseBalance(baseUsdc, recipient.address, before);
  console.log(`Recipient Base USDC after: ${ethers.formatUnits(after, 6)}`);

  const minted = after - before;
  const cctpOk = orch.cctpCompletions.some((c) => c.confirmed) || minted > 0n;

  if (!cctpOk) {
    throw new Error("CCTP cross-chain payroll did not mint USDC on Base Sepolia");
  }

  console.log("\n✓ CCTP cross-chain payroll test passed");
  if (minted > 0n && minted < salary) {
    console.log(
      `  (minted ${ethers.formatUnits(minted, 6)} < salary ${ethers.formatUnits(salary, 6)} — relay fee deducted)`
    );
  }
}

main().catch((e) => {
  console.error("test:cross-chain-cctp FAILED:", e.message ?? e);
  process.exit(1);
});
