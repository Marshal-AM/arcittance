import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { ethers } from "ethers";
import { BASE_SEPOLIA_CCTP_DOMAIN } from "../config/arc.testnet";
import { requirePayrollVaultAddress } from "./lib/resolve-payroll-vault";

dotenv.config();

const USDC = "0x3600000000000000000000000000000000000000";

async function main() {
  const addresses = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../deployments/arc/addresses.json"), "utf8")
  );
  const vaultAddr = requirePayrollVaultAddress();
  const routerAddr = addresses.contracts.CrossChainRouter;

  const provider = new ethers.JsonRpcProvider(process.env.ARC_RPC_URL);
  const deployer = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY!, provider);
  const keeper = new ethers.Wallet(process.env.KEEPER_PRIVATE_KEY!, provider);

  const router = new ethers.Contract(routerAddr, [
    "function authorizedVaults(address) view returns (bool)",
  ], provider);
  const usdc = new ethers.Contract(USDC, [
    "function balanceOf(address) view returns (uint256)",
    "function allowance(address,address) view returns (uint256)",
  ], provider);
  const vault = new ethers.Contract(vaultAddr, [
    "function employeeCount() view returns (uint256)",
    "function getEmployee(uint256) view returns (tuple(address wallet,uint256 salaryAmount,address payToken,uint256 payInterval,uint256 nextPaymentDue,uint256 approvedCap,uint32 destinationChainId,uint8 routingMethod,uint8 transferSpeed,bool active))",
    "function deposit(address,uint256)",
    "function registerEmployee(address,uint256,address,uint256,uint256,uint32,uint8,uint8) returns (uint256)",
    "function deactivateEmployee(uint256)",
    "function runPayroll()",
  ], deployer);

  const authorized = await router.authorizedVaults(vaultAddr);
  const vaultBal = await usdc.balanceOf(vaultAddr);
  const allowance = await usdc.allowance(vaultAddr, routerAddr);
  const count = Number(await vault.employeeCount());
  const block = await provider.getBlock("latest");
  const now = block!.timestamp;

  console.log("vault:", vaultAddr);
  console.log("router:", routerAddr);
  console.log("authorized:", authorized);
  console.log("vault USDC:", ethers.formatUnits(vaultBal, 6));
  console.log("vault->router allowance:", ethers.formatUnits(allowance, 6));
  console.log("employees:", count, "timestamp:", now);

  let dueCount = 0;
  for (let i = 0; i < count; i++) {
    const e = await vault.getEmployee(i);
    if (!e.active) continue;
    const due = Number(e.nextPaymentDue) <= now;
    if (due) dueCount++;
    console.log(
      `  #${i} dest=${e.destinationChainId} route=${e.routingMethod} due=${due} salary=${ethers.formatUnits(e.salaryAmount, 6)}`
    );
  }
  console.log("due employees:", dueCount);

  const MESSENGER = "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA";
  const routerBal = await usdc.balanceOf(routerAddr);
  const routerAllow = await usdc.allowance(routerAddr, MESSENGER);
  console.log("router USDC:", ethers.formatUnits(routerBal, 6));
  console.log("router->messenger allowance:", ethers.formatUnits(routerAllow, 6));

  for (let i = 0; i < count; i++) {
    const e = await vault.getEmployee(i);
    if (e.active && Number(e.destinationChainId) > 0) {
      console.log(`deactivating cross-chain employee #${i}`);
      await (await vault.deactivateEmployee(i)).wait();
    }
  }

  const recipient = ethers.Wallet.createRandom();
  const salary = ethers.parseUnits("0.01", 6);
  const usdcSigner = new ethers.Contract(USDC, [
    "function approve(address,uint256) returns (bool)",
  ], deployer);

  await (await usdcSigner.approve(vaultAddr, salary * 2n)).wait();
  await (await vault.deposit(USDC, salary * 2n)).wait();
  await (await vault.registerEmployee(
    recipient.address, salary, USDC, 86400n, salary * 12n, BASE_SEPOLIA_CCTP_DOMAIN, 0, 0
  )).wait();
  console.log("registered cross-chain employee:", recipient.address);

  const vaultKeeper = vault.connect(keeper) as ethers.Contract;
  try {
    await vaultKeeper.getFunction("runPayroll").staticCall();
    console.log("staticCall OK");
  } catch (e: any) {
    console.log("staticCall FAIL:", e.shortMessage ?? e.message);
    if (e.data) console.log("revert data:", e.data);
  }

  try {
    const gas = await vaultKeeper.getFunction("runPayroll").estimateGas();
    console.log("estimateGas OK:", gas.toString());
  } catch (e: any) {
    console.log("estimateGas FAIL:", e.shortMessage ?? e.message);
    if (e.data) console.log("revert data:", e.data);
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
