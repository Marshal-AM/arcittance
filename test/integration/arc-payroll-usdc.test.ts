/**
 * Integration test: fund PayrollVault with real Arc testnet USDC and run payroll.
 *
 * Run: npm run test:integration
 * Requires: .env with EMPLOYER_DEMO_PRIVATE_KEY, KEEPER_PRIVATE_KEY, deployed addresses.json
 */

import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { resolvePayrollVault } from "../helpers/resolve-payroll-vault";

const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";
const SALARY = ethers.parseUnits("0.01", 6); // minimal — faucet-funded wallets
const INTERVAL = 30 * 24 * 3600;

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
];

async function deactivateAllEmployees(vault: any, owner: any): Promise<void> {
  const count = await vault.employeeCount();
  for (let i = 0; i < Number(count); i++) {
    const emp = await vault.getEmployee(i);
    if (emp.active) {
      await (await vault.connect(owner).deactivateEmployee(i)).wait();
    }
  }
}

describe("Arc integration: real USDC payroll", function () {
  this.timeout(180_000);

  before(function () {
    if (!process.env.DEPLOYER_PRIVATE_KEY || !process.env.KEEPER_PRIVATE_KEY) {
      console.log("Skipping integration test — DEPLOYER_PRIVATE_KEY / KEEPER_PRIVATE_KEY not set");
      this.skip();
    }
    if (process.env.SKIP_INTEGRATION === "1") {
      this.skip();
    }
  });

  it("employer deposits USDC, keeper runs payroll, employee balance increases", async function () {
    const vaultAddr = await resolvePayrollVault(owner);

    const provider = ethers.provider;
    const owner    = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY!, provider);
    const keeper   = new ethers.Wallet(process.env.KEEPER_PRIVATE_KEY!, provider);

    const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, owner);
    const vault = await ethers.getContractAt("PayrollVault", vaultAddr, owner);

    await deactivateAllEmployees(vault, owner);

    // Fresh employee wallet per run — avoids duplicate roster entries on reruns
    const employee = ethers.Wallet.createRandom().connect(provider);
    const employeeAddr = await employee.getAddress();

    const empCountBefore = await vault.employeeCount();

    // Register employee if not already at this index (idempotent-ish: always add new for test)
    const cap = SALARY * 12n;
    const depositAmount = SALARY * 2n;

    const employerBal = await usdc.balanceOf(owner.address);
    if (employerBal < depositAmount + SALARY) {
      console.log(`Skipping — insufficient USDC (have ${employerBal}, need ${depositAmount + SALARY})`);
      this.skip();
    }

    const approveTx = await usdc.connect(owner).approve(vaultAddr, depositAmount);
    await approveTx.wait();
    const allowance = await usdc.allowance(owner.address, vaultAddr);
    expect(allowance).to.be.gte(depositAmount);

    const depositTx = await vault.connect(owner).deposit(USDC_ADDRESS, depositAmount);
    await depositTx.wait();

    const regTx = await vault.connect(owner).registerEmployee(
      employeeAddr,
      SALARY,
      USDC_ADDRESS,
      INTERVAL,
      cap,
      0,
      0,
      0
    );
    await regTx.wait();

    expect(await vault.employeeCount()).to.equal(empCountBefore + 1n);

    const balBefore = await usdc.balanceOf(employeeAddr);

    // Keeper runs payroll (permissionless)
    const vaultAsKeeper = vault.connect(keeper);
    const payrollTx = await vaultAsKeeper.runPayroll();
    await payrollTx.wait();

    const balAfter = await usdc.balanceOf(employeeAddr);
    expect(balAfter - balBefore).to.equal(SALARY);
  });
});
