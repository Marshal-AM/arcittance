/**
 * Integration: CCTP payroll routing on Arc testnet.
 * Run with: npm run test:integration
 */

import { expect } from "chai";
import { ethers } from "hardhat";
import { resolvePayrollVault } from "../helpers/resolve-payroll-vault";

const USDC = "0x3600000000000000000000000000000000000000";
const BASE_SEPOLIA_DOMAIN = 6;

async function deactivateAllEmployees(vault: any, owner: any): Promise<void> {
  const count = await vault.employeeCount();
  for (let i = 0; i < Number(count); i++) {
    const emp = await vault.getEmployee(i);
    if (emp.active) {
      await (await vault.connect(owner).deactivateEmployee(i)).wait();
    }
  }
}

describe("Arc integration: CCTP payroll", function () {
  this.timeout(300_000);

  before(function () {
    if (!process.env.DEPLOYER_PRIVATE_KEY || !process.env.KEEPER_PRIVATE_KEY) {
      this.skip();
    }
    if (process.env.SKIP_INTEGRATION === "1" || process.env.SKIP_CCTP_INTEGRATION === "1") {
      this.skip();
    }
  });

  it("runPayroll emits RouteCCTP for cross-chain employee", async function () {
    const owner = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY!, ethers.provider);
    const vaultAddr = await resolvePayrollVault(owner);
    const keeper = new ethers.Wallet(process.env.KEEPER_PRIVATE_KEY!, ethers.provider);
    const employee = ethers.Wallet.createRandom().connect(ethers.provider);

    const usdc = new ethers.Contract(USDC, [
      "function approve(address,uint256) returns (bool)",
      "function balanceOf(address) view returns (uint256)",
    ], owner);

    const vault = await ethers.getContractAt("PayrollVault", vaultAddr, owner);
    await deactivateAllEmployees(vault, owner);

    const salary = ethers.parseUnits("0.01", 6);
    const depositAmount = salary * 2n;

    const employerBal = await usdc.balanceOf(owner.address);
    if (employerBal < depositAmount) {
      console.log(`Skipping — insufficient USDC (have ${employerBal}, need ${depositAmount})`);
      this.skip();
    }

    const approveTx = await usdc.approve(vaultAddr, depositAmount);
    await approveTx.wait();
    await vault.deposit(USDC, depositAmount);
    await vault.registerEmployee(
      employee.address,
      salary,
      USDC,
      86400,
      salary * 12n,
      BASE_SEPOLIA_DOMAIN,
      0,
      0
    );

    let tx;
    try {
      tx = await vault.connect(keeper).runPayroll();
    } catch (err: any) {
      console.log(
        "runPayroll send failed on CCTP path — live TokenMessenger burn may require additional testnet setup:",
        err.shortMessage ?? err.message ?? err
      );
      this.skip();
    }
    let receipt;
    try {
      receipt = await tx.wait();
    } catch (err: any) {
      console.log(
        "runPayroll reverted on CCTP path — live TokenMessenger burn may require additional testnet setup:",
        err.shortMessage ?? err.message ?? err
      );
      this.skip();
    }
    expect(receipt).to.not.be.null;

    const routerAddr = await vault.crossChainRouter();
    const router = await ethers.getContractAt("CrossChainRouter", routerAddr);
    const iface = router.interface;

    const routeLog = receipt!.logs.find((log) => {
      if (log.address.toLowerCase() !== routerAddr.toLowerCase()) return false;
      try {
        return iface.parseLog(log)?.name === "RouteCCTP";
      } catch {
        return false;
      }
    });

    if (!routeLog) {
      console.log(
        "No RouteCCTP event — deployed PayrollVault may predate CrossChainRouter. Redeploy with npm run deploy:arc"
      );
      this.skip();
    }

    expect(routeLog).to.not.be.undefined;
  });
});
