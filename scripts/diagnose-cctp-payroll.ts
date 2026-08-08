import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { ethers } from "ethers";
import { BASE_SEPOLIA_CCTP_DOMAIN } from "../config/arc.testnet";
import { requirePayrollVaultAddress } from "./lib/resolve-payroll-vault";

dotenv.config();

const USDC = "0x3600000000000000000000000000000000000000";

async function main() {
  const vaultAddr = requirePayrollVaultAddress();
  const addresses = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../deployments/arc/addresses.json"), "utf8")
  );
  const routerAddr = addresses.contracts.CrossChainRouter;

  const provider = new ethers.JsonRpcProvider(process.env.ARC_RPC_URL);
  const deployer = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY!, provider);
  const keeper = new ethers.Wallet(process.env.KEEPER_PRIVATE_KEY!, provider);
  const recipient = ethers.Wallet.createRandom();
  const salary = ethers.parseUnits("0.01", 6);

  const usdc = new ethers.Contract(USDC, ["function approve(address,uint256) returns (bool)"], deployer);
  const vault = new ethers.Contract(vaultAddr, [
    "function deposit(address,uint256)",
    "function registerEmployee(address,uint256,address,uint256,uint256,uint32,uint8,uint8) returns (uint256)",
    "function runPayroll()",
  ], deployer);

  await (await usdc.approve(vaultAddr, salary * 2n)).wait();
  await (await vault.deposit(USDC, salary * 2n)).wait();
  await (await vault.registerEmployee(
    recipient.address, salary, USDC, 86400n, salary * 12n, BASE_SEPOLIA_CCTP_DOMAIN, 0, 0
  )).wait();

  const vaultKeeper = vault.connect(keeper) as ethers.Contract;
  try {
    const gas = await vaultKeeper.getFunction("runPayroll").estimateGas();
    console.log("estimateGas OK:", gas.toString());
    const tx = await vaultKeeper.getFunction("runPayroll")();
    const receipt = await tx.wait();
    console.log("SUCCESS tx:", receipt?.hash, "status:", receipt?.status);
    const routeLog = receipt?.logs.filter((l) => l.address.toLowerCase() === routerAddr.toLowerCase());
    console.log("router logs:", routeLog?.length ?? 0);
  } catch (e: any) {
    console.log("FAIL:", e.shortMessage ?? e.message);
  }
}

main();
