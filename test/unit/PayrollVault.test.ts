import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

const INTERVAL = 30 * 24 * 3600; // 30 days
const BASE_SEPOLIA_DOMAIN = 6; // CCTP destination domain for cross-chain tests

// ─────────────────────────────────────────────────────────────────────────────
// Fixture
// ─────────────────────────────────────────────────────────────────────────────

async function deployPayrollVaultFixture() {
  const [owner, alice, bob, carol, stranger] = await ethers.getSigners();

  const MockERC20F = await ethers.getContractFactory("MockERC20");
  const mockUsdc   = await MockERC20F.deploy("Test USDC", "USDC", 6);

  const SchedulerF = await ethers.getContractFactory("PayrollScheduler");
  const scheduler  = await SchedulerF.deploy();

  const RouterF    = await ethers.getContractFactory("MockCrossChainRouter");
  const mockRouter = await RouterF.deploy();

  const VaultF = await ethers.getContractFactory("PayrollVault");
  const vault  = await VaultF.deploy(
    await scheduler.getAddress(),
    await mockRouter.getAddress()
  );

  const MILLION = ethers.parseUnits("1000000", 6);
  await mockUsdc.mint(owner.address, MILLION);

  const USDC_ADDRESS = await mockUsdc.getAddress();

  return {
    vault, mockUsdc, scheduler, mockRouter,
    owner, alice, bob, carol, stranger,
    USDC_ADDRESS, MILLION,
  };
}

async function setupWithOneEmployee(
  fixture: Awaited<ReturnType<typeof deployPayrollVaultFixture>>,
  salary = ethers.parseUnits("1000", 6),
  destinationChainId = 0,
  employeeAddr?: string
) {
  const { vault, mockUsdc, alice, USDC_ADDRESS } = fixture;
  const empAddr = employeeAddr ?? alice.address;
  const depositAmount = salary * 10n;
  await mockUsdc.approve(await vault.getAddress(), depositAmount);
  await vault.deposit(USDC_ADDRESS, depositAmount);
  await vault.registerEmployee(
    empAddr, salary, USDC_ADDRESS, INTERVAL, salary * 10n, destinationChainId, 0, 0
  );
  return { empAddr, salary };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("PayrollVault", function () {

  describe("constructor", function () {
    it("reverts if scheduler address is zero", async function () {
      const RouterF = await ethers.getContractFactory("MockCrossChainRouter");
      const router  = await RouterF.deploy();
      const VaultF  = await ethers.getContractFactory("PayrollVault");
      await expect(
        VaultF.deploy(ethers.ZeroAddress, await router.getAddress())
      ).to.be.revertedWith("Invalid scheduler address");
    });

    it("reverts if router address is zero", async function () {
      const SchedulerF = await ethers.getContractFactory("PayrollScheduler");
      const scheduler  = await SchedulerF.deploy();
      const VaultF     = await ethers.getContractFactory("PayrollVault");
      await expect(
        VaultF.deploy(await scheduler.getAddress(), ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid router address");
    });
  });

  describe("deposit()", function () {
    it("increases vault balance by deposited amount", async function () {
      const { vault, mockUsdc, USDC_ADDRESS } = await loadFixture(deployPayrollVaultFixture);
      const amount = ethers.parseUnits("5000", 6);
      await mockUsdc.approve(await vault.getAddress(), amount);
      await vault.deposit(USDC_ADDRESS, amount);
      expect(await vault.vaultBalance(USDC_ADDRESS)).to.equal(amount);
    });

    it("emits VaultDeposited with correct args", async function () {
      const { vault, mockUsdc, USDC_ADDRESS } = await loadFixture(deployPayrollVaultFixture);
      const amount = ethers.parseUnits("1000", 6);
      await mockUsdc.approve(await vault.getAddress(), amount);
      await expect(vault.deposit(USDC_ADDRESS, amount))
        .to.emit(vault, "VaultDeposited")
        .withArgs(USDC_ADDRESS, amount);
    });

    it("reverts if caller is not owner", async function () {
      const { vault, mockUsdc, stranger, USDC_ADDRESS } = await loadFixture(deployPayrollVaultFixture);
      const amount = ethers.parseUnits("100", 6);
      await mockUsdc.mint(stranger.address, amount);
      await mockUsdc.connect(stranger).approve(await vault.getAddress(), amount);
      await expect(vault.connect(stranger).deposit(USDC_ADDRESS, amount))
        .to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    });

    it("reverts if allowance is insufficient", async function () {
      const { vault, USDC_ADDRESS } = await loadFixture(deployPayrollVaultFixture);
      await expect(vault.deposit(USDC_ADDRESS, ethers.parseUnits("100", 6)))
        .to.be.revertedWith("Insufficient allowance");
    });

    it("reverts if amount is zero", async function () {
      const { vault, USDC_ADDRESS } = await loadFixture(deployPayrollVaultFixture);
      await expect(vault.deposit(USDC_ADDRESS, 0n))
        .to.be.revertedWith("Amount must be > 0");
    });

    it("reverts if token is zero address", async function () {
      const { vault } = await loadFixture(deployPayrollVaultFixture);
      await expect(vault.deposit(ethers.ZeroAddress, 100n))
        .to.be.revertedWith("Invalid token");
    });
  });

  describe("registerEmployee()", function () {
    it("stores all 7 fields correctly", async function () {
      const { vault, USDC_ADDRESS, alice } = await loadFixture(deployPayrollVaultFixture);
      const salary = ethers.parseUnits("500", 6);
      const cap    = salary * 12n;
      await vault.registerEmployee(alice.address, salary, USDC_ADDRESS, INTERVAL, cap, 0, 0, 0);
      const emp = await vault.getEmployee(0);
      expect(emp.wallet).to.equal(alice.address);
      expect(emp.salaryAmount).to.equal(salary);
      expect(emp.payToken).to.equal(USDC_ADDRESS);
      expect(emp.payInterval).to.equal(INTERVAL);
      expect(emp.approvedCap).to.equal(cap);
      expect(emp.destinationChainId).to.equal(0);
      expect(emp.active).to.be.true;
    });

    it("returns correct ID starting from 0", async function () {
      const { vault, USDC_ADDRESS, alice, bob } = await loadFixture(deployPayrollVaultFixture);
      const salary = ethers.parseUnits("100", 6);
      const id0 = await vault.registerEmployee.staticCall(alice.address, salary, USDC_ADDRESS, INTERVAL, salary, 0, 0, 0);
      await vault.registerEmployee(alice.address, salary, USDC_ADDRESS, INTERVAL, salary, 0, 0, 0);
      const id1 = await vault.registerEmployee.staticCall(bob.address, salary, USDC_ADDRESS, INTERVAL, salary, 0, 0, 0);
      expect(id0).to.equal(0n);
      expect(id1).to.equal(1n);
    });

    it("increments employeeCount", async function () {
      const { vault, USDC_ADDRESS, alice, bob } = await loadFixture(deployPayrollVaultFixture);
      const salary = ethers.parseUnits("100", 6);
      expect(await vault.employeeCount()).to.equal(0n);
      await vault.registerEmployee(alice.address, salary, USDC_ADDRESS, INTERVAL, salary, 0, 0, 0);
      expect(await vault.employeeCount()).to.equal(1n);
      await vault.registerEmployee(bob.address, salary, USDC_ADDRESS, INTERVAL, salary, 0, 0, 0);
      expect(await vault.employeeCount()).to.equal(2n);
    });

    it("emits EmployeeRegistered with correct args", async function () {
      const { vault, USDC_ADDRESS, alice } = await loadFixture(deployPayrollVaultFixture);
      const salary = ethers.parseUnits("200", 6);
      await expect(vault.registerEmployee(alice.address, salary, USDC_ADDRESS, INTERVAL, salary, 0, 0, 0))
        .to.emit(vault, "EmployeeRegistered")
        .withArgs(0n, alice.address, salary, 0, 0);
    });

    it("reverts if caller is not owner", async function () {
      const { vault, USDC_ADDRESS, alice, stranger } = await loadFixture(deployPayrollVaultFixture);
      await expect(vault.connect(stranger).registerEmployee(alice.address, 100n, USDC_ADDRESS, INTERVAL, 100n, 0, 0, 0))
        .to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    });

    it("reverts if wallet is zero address", async function () {
      const { vault, USDC_ADDRESS } = await loadFixture(deployPayrollVaultFixture);
      await expect(vault.registerEmployee(ethers.ZeroAddress, 100n, USDC_ADDRESS, INTERVAL, 100n, 0, 0, 0))
        .to.be.revertedWith("Invalid wallet");
    });

    it("reverts if salary is zero", async function () {
      const { vault, USDC_ADDRESS, alice } = await loadFixture(deployPayrollVaultFixture);
      await expect(vault.registerEmployee(alice.address, 0n, USDC_ADDRESS, INTERVAL, 100n, 0, 0, 0))
        .to.be.revertedWith("Salary must be > 0");
    });

    it("reverts if interval is zero", async function () {
      const { vault, USDC_ADDRESS, alice } = await loadFixture(deployPayrollVaultFixture);
      await expect(vault.registerEmployee(alice.address, 100n, USDC_ADDRESS, 0, 100n, 0, 0, 0))
        .to.be.revertedWith("Interval must be > 0");
    });

    it("reverts if cap < salary", async function () {
      const { vault, USDC_ADDRESS, alice } = await loadFixture(deployPayrollVaultFixture);
      await expect(vault.registerEmployee(alice.address, 200n, USDC_ADDRESS, INTERVAL, 100n, 0, 0, 0))
        .to.be.revertedWith("Cap must be >= salary");
    });

    it("stores destinationChainId 0 (Arc-local) correctly", async function () {
      const { vault, USDC_ADDRESS, alice } = await loadFixture(deployPayrollVaultFixture);
      await vault.registerEmployee(alice.address, 100n, USDC_ADDRESS, INTERVAL, 100n, 0, 0, 0);
      expect((await vault.getEmployee(0)).destinationChainId).to.equal(0);
    });

    it("stores destinationChainId >0 (CCTP domain) correctly", async function () {
      const { vault, USDC_ADDRESS, alice } = await loadFixture(deployPayrollVaultFixture);
      await vault.registerEmployee(alice.address, 100n, USDC_ADDRESS, INTERVAL, 100n, BASE_SEPOLIA_DOMAIN, 0, 0);
      expect((await vault.getEmployee(0)).destinationChainId).to.equal(BASE_SEPOLIA_DOMAIN);
    });

    it("sets nextPaymentDue to block.timestamp at registration", async function () {
      const { vault, USDC_ADDRESS, alice } = await loadFixture(deployPayrollVaultFixture);
      await vault.registerEmployee(alice.address, 100n, USDC_ADDRESS, INTERVAL, 100n, 0, 0, 0);
      const block = await ethers.provider.getBlock("latest");
      const emp   = await vault.getEmployee(0);
      expect(emp.nextPaymentDue).to.equal(BigInt(block!.timestamp));
    });
  });

  describe("deactivateEmployee()", function () {
    it("sets active = false", async function () {
      const { vault, USDC_ADDRESS, alice } = await loadFixture(deployPayrollVaultFixture);
      await vault.registerEmployee(alice.address, 100n, USDC_ADDRESS, INTERVAL, 100n, 0, 0, 0);
      await vault.deactivateEmployee(0);
      expect((await vault.getEmployee(0)).active).to.be.false;
    });

    it("emits EmployeeDeactivated", async function () {
      const { vault, USDC_ADDRESS, alice } = await loadFixture(deployPayrollVaultFixture);
      await vault.registerEmployee(alice.address, 100n, USDC_ADDRESS, INTERVAL, 100n, 0, 0, 0);
      await expect(vault.deactivateEmployee(0))
        .to.emit(vault, "EmployeeDeactivated")
        .withArgs(0n);
    });

    it("reverts if already inactive", async function () {
      const { vault, USDC_ADDRESS, alice } = await loadFixture(deployPayrollVaultFixture);
      await vault.registerEmployee(alice.address, 100n, USDC_ADDRESS, INTERVAL, 100n, 0, 0, 0);
      await vault.deactivateEmployee(0);
      await expect(vault.deactivateEmployee(0)).to.be.revertedWith("Already inactive");
    });

    it("reverts if caller not owner", async function () {
      const { vault, USDC_ADDRESS, alice, stranger } = await loadFixture(deployPayrollVaultFixture);
      await vault.registerEmployee(alice.address, 100n, USDC_ADDRESS, INTERVAL, 100n, 0, 0, 0);
      await expect(vault.connect(stranger).deactivateEmployee(0))
        .to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    });
  });

  describe("runPayroll()", function () {
    it("pays all due active employees via local transfer", async function () {
      const f = await loadFixture(deployPayrollVaultFixture);
      const { vault, mockUsdc, USDC_ADDRESS, alice, bob } = f;
      const salary = ethers.parseUnits("500", 6);
      await f.mockUsdc.approve(await vault.getAddress(), salary * 20n);
      await vault.deposit(USDC_ADDRESS, salary * 20n);
      await vault.registerEmployee(alice.address, salary, USDC_ADDRESS, INTERVAL, salary * 10n, 0, 0, 0);
      await vault.registerEmployee(bob.address,   salary, USDC_ADDRESS, INTERVAL, salary * 10n, 0, 0, 0);

      const aliceBefore = await mockUsdc.balanceOf(alice.address);
      const bobBefore   = await mockUsdc.balanceOf(bob.address);
      await vault.runPayroll();
      expect(await mockUsdc.balanceOf(alice.address)).to.equal(aliceBefore + salary);
      expect(await mockUsdc.balanceOf(bob.address)).to.equal(bobBefore + salary);
    });

    it("with empty due list: exits without calling router", async function () {
      const f = await loadFixture(deployPayrollVaultFixture);
      const { vault, mockRouter, USDC_ADDRESS, alice } = f;
      await setupWithOneEmployee(f, ethers.parseUnits("100", 6), 0, alice.address);
      await vault.runPayroll(); // first run pays
      await vault.runPayroll(); // second run — not due yet

      expect(await mockRouter.cctpCallCount()).to.equal(0n);
      expect(await mockRouter.gatewayCallCount()).to.equal(0n);
    });

    it("Arc-local employee (destinationChainId=0): direct transfer, no router", async function () {
      const f = await loadFixture(deployPayrollVaultFixture);
      const { vault, mockRouter, mockUsdc, USDC_ADDRESS, alice } = f;
      const salary = ethers.parseUnits("100", 6);
      await setupWithOneEmployee(f, salary, 0, alice.address);

      const before = await mockUsdc.balanceOf(alice.address);
      await vault.runPayroll();

      expect(await mockUsdc.balanceOf(alice.address)).to.equal(before + salary);
      expect(await mockRouter.cctpCallCount()).to.equal(0n);
      expect(await mockRouter.gatewayCallCount()).to.equal(0n);
    });

    it("cross-chain employee (destinationChainId>0): calls routeCCTP, not routeGateway", async function () {
      const f = await loadFixture(deployPayrollVaultFixture);
      const { vault, mockRouter, USDC_ADDRESS, bob } = f;
      const salary = ethers.parseUnits("100", 6);
      await setupWithOneEmployee(f, salary, BASE_SEPOLIA_DOMAIN, bob.address);

      await vault.runPayroll();

      expect(await mockRouter.cctpCallCount()).to.equal(1n);
      expect(await mockRouter.gatewayCallCount()).to.equal(0n);
      expect(await mockRouter.lastToken()).to.equal(USDC_ADDRESS);
      expect(await mockRouter.lastAmount()).to.equal(salary);
      expect(await mockRouter.lastDestinationDomain()).to.equal(BASE_SEPOLIA_DOMAIN);
      expect(await mockRouter.lastRecipient()).to.equal(bob.address);
    });

    it("Mixed roster: 2 Arc-local + 1 CCTP — correct transfer and route counts", async function () {
      const { vault, mockUsdc, mockRouter, alice, bob, carol, USDC_ADDRESS } =
        await loadFixture(deployPayrollVaultFixture);

      const salary = ethers.parseUnits("100", 6);
      await mockUsdc.approve(await vault.getAddress(), salary * 20n);
      await vault.deposit(USDC_ADDRESS, salary * 20n);

      await vault.registerEmployee(alice.address, salary, USDC_ADDRESS, INTERVAL, salary * 10n, 0, 0, 0);
      await vault.registerEmployee(carol.address, salary, USDC_ADDRESS, INTERVAL, salary * 10n, 0, 0, 0);
      await vault.registerEmployee(bob.address,   salary, USDC_ADDRESS, INTERVAL, salary * 10n, BASE_SEPOLIA_DOMAIN, 0, 0);

      const aliceBefore = await mockUsdc.balanceOf(alice.address);
      const carolBefore = await mockUsdc.balanceOf(carol.address);

      await vault.runPayroll();

      expect(await mockUsdc.balanceOf(alice.address)).to.equal(aliceBefore + salary);
      expect(await mockUsdc.balanceOf(carol.address)).to.equal(carolBefore + salary);
      expect(await mockRouter.cctpCallCount()).to.equal(1n);
      expect(await mockRouter.gatewayCallCount()).to.equal(0n);
    });

    it("updates nextPaymentDue for all paid employees", async function () {
      const f = await loadFixture(deployPayrollVaultFixture);
      const { vault } = f;
      await setupWithOneEmployee(f, ethers.parseUnits("100", 6), 0, f.alice.address);

      const before = await vault.getEmployee(0);
      const T0 = before.nextPaymentDue;

      await vault.runPayroll();

      const after = await vault.getEmployee(0);
      expect(after.nextPaymentDue).to.equal(T0 + BigInt(INTERVAL));
    });

    it("reverts if vault balance insufficient", async function () {
      const { vault, mockUsdc, USDC_ADDRESS, alice } =
        await loadFixture(deployPayrollVaultFixture);

      const salary  = ethers.parseUnits("100", 6);
      const deposit = ethers.parseUnits("50", 6);
      await mockUsdc.approve(await vault.getAddress(), deposit);
      await vault.deposit(USDC_ADDRESS, deposit);
      await vault.registerEmployee(alice.address, salary, USDC_ADDRESS, INTERVAL, salary * 10n, 0, 0, 0);

      await expect(vault.runPayroll()).to.be.revertedWith("Insufficient vault balance");
    });

    it("emits PayrollExecuted with correct employeeCount and totalPayout", async function () {
      const f = await loadFixture(deployPayrollVaultFixture);
      const { vault } = f;
      const salary = ethers.parseUnits("100", 6);
      await setupWithOneEmployee(f, salary, 0, f.alice.address);

      await expect(vault.runPayroll())
        .to.emit(vault, "PayrollExecuted")
        .withArgs(1n, salary);
    });

    it("only pays ACTIVE employees", async function () {
      const { vault, mockUsdc, USDC_ADDRESS, alice, bob, carol } =
        await loadFixture(deployPayrollVaultFixture);

      const salary = ethers.parseUnits("100", 6);
      await mockUsdc.approve(await vault.getAddress(), salary * 20n);
      await vault.deposit(USDC_ADDRESS, salary * 20n);

      await vault.registerEmployee(alice.address, salary, USDC_ADDRESS, INTERVAL, salary * 10n, 0, 0, 0);
      await vault.registerEmployee(bob.address,   salary, USDC_ADDRESS, INTERVAL, salary * 10n, 0, 0, 0);
      await vault.registerEmployee(carol.address, salary, USDC_ADDRESS, INTERVAL, salary * 10n, 0, 0, 0);

      await vault.deactivateEmployee(2);

      const carolBefore = await mockUsdc.balanceOf(carol.address);
      await vault.runPayroll();
      expect(await mockUsdc.balanceOf(carol.address)).to.equal(carolBefore); // not paid
    });

    it("exits cleanly when no active employees exist", async function () {
      const { vault, mockRouter } = await loadFixture(deployPayrollVaultFixture);
      await vault.runPayroll();
      expect(await mockRouter.cctpCallCount()).to.equal(0n);
      expect(await mockRouter.gatewayCallCount()).to.equal(0n);
    });

    it("skips employees not yet due (scheduler filters by nextPaymentDue)", async function () {
      const f = await loadFixture(deployPayrollVaultFixture);
      const { vault, mockUsdc, USDC_ADDRESS, alice } = f;
      const salary = ethers.parseUnits("100", 6);
      await setupWithOneEmployee(f, salary, 0, alice.address);

      await vault.runPayroll();
      const afterFirst = await mockUsdc.balanceOf(alice.address);

      // Still within pay interval — second run should not pay again
      await vault.runPayroll();
      expect(await mockUsdc.balanceOf(alice.address)).to.equal(afterFirst);

      // Advance past interval — now due again
      await time.increase(INTERVAL + 1);
      await vault.runPayroll();
      expect(await mockUsdc.balanceOf(alice.address)).to.equal(afterFirst + salary);
    });
  });

  describe("reentrancy guard", function () {
    it("runPayroll() blocks reentrant calls via scheduler callback", async function () {
      const { mockUsdc, USDC_ADDRESS, alice } = await loadFixture(deployPayrollVaultFixture);
      const [owner] = await ethers.getSigners();

      const ReentrantF = await ethers.getContractFactory("MockSchedulerReentry");
      const reentrant  = await ReentrantF.deploy();

      const RouterF = await ethers.getContractFactory("MockCrossChainRouter");
      const router  = await RouterF.deploy();

      const VaultF = await ethers.getContractFactory("PayrollVault");
      const vault  = await VaultF.deploy(await reentrant.getAddress(), await router.getAddress());

      await reentrant.setVault(await vault.getAddress());

      const salary = ethers.parseUnits("10", 6);
      await mockUsdc.mint(owner.address, salary * 10n);
      await mockUsdc.approve(await vault.getAddress(), salary * 10n);
      await vault.deposit(USDC_ADDRESS, salary * 10n);
      await vault.registerEmployee(alice.address, salary, USDC_ADDRESS, INTERVAL, salary * 10n, 0, 0, 0);

      await expect(vault.runPayroll()).to.be.reverted;
    });
  });

  describe("vaultBalance()", function () {
    it("returns correct balance after deposit", async function () {
      const { vault, mockUsdc, USDC_ADDRESS } = await loadFixture(deployPayrollVaultFixture);
      const amount = ethers.parseUnits("2500", 6);
      await mockUsdc.approve(await vault.getAddress(), amount);
      await vault.deposit(USDC_ADDRESS, amount);
      expect(await vault.vaultBalance(USDC_ADDRESS)).to.equal(amount);
    });

    it("returns 0 for token with no deposits", async function () {
      const { vault } = await loadFixture(deployPayrollVaultFixture);
      const MockERC20F = await ethers.getContractFactory("MockERC20");
      const otherToken = await MockERC20F.deploy("Other", "OTH", 6);
      expect(await vault.vaultBalance(await otherToken.getAddress())).to.equal(0n);
    });
  });

  describe("EURC dual-asset", function () {
    it("deposit and payroll with EURC (6 decimals)", async function () {
      const f = await loadFixture(deployPayrollVaultFixture);
      const { vault, owner, alice } = f;

      const MockERC20F = await ethers.getContractFactory("MockERC20");
      const mockEurc   = await MockERC20F.deploy("Euro Coin", "EURC", 6);
      const EURC_ADDRESS = await mockEurc.getAddress();

      const salary = ethers.parseUnits("500", 6);
      const depositAmount = salary * 5n;
      await mockEurc.mint(owner.address, depositAmount);
      await mockEurc.approve(await vault.getAddress(), depositAmount);
      await vault.deposit(EURC_ADDRESS, depositAmount);

      await vault.registerEmployee(
        alice.address,
        salary,
        EURC_ADDRESS,
        INTERVAL,
        salary * 10n,
        0,
        0,
        0
      );

      const before = await mockEurc.balanceOf(alice.address);
      await vault.runPayroll();
      expect(await mockEurc.balanceOf(alice.address)).to.equal(before + salary);
    });
  });
});
