import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("PayrollOrgRegistry", function () {
  async function deployFixture() {
    const [alice, bob] = await ethers.getSigners();

    const SchedulerF = await ethers.getContractFactory("PayrollScheduler");
    const scheduler  = await SchedulerF.deploy();

    const RouterF = await ethers.getContractFactory("CrossChainRouter");
    const messenger = "0x0000000000000000000000000000000000000001";
    const usdc      = "0x0000000000000000000000000000000000000002";
    const router    = await RouterF.deploy(messenger, usdc, alice.address);

    const RegistryF = await ethers.getContractFactory("PayrollOrgRegistry");
    const registry  = await RegistryF.deploy(
      await scheduler.getAddress(),
      await router.getAddress()
    );

    await router.setVaultRegistry(await registry.getAddress());

    return { alice, bob, scheduler, router, registry };
  }

  it("creates organisation with creator as admin", async function () {
    const { alice, registry } = await loadFixture(deployFixture);

    await expect(registry.connect(alice).createOrganization("Acme DAO"))
      .to.emit(registry, "OrganizationCreated")
      .withArgs(0n, alice.address, "Acme DAO");

    const org = await registry.getOrganization(0);
    expect(org.name).to.equal("Acme DAO");
    expect(org.creator).to.equal(alice.address);
    expect(org.vaultCreated).to.equal(false);
    expect(await registry.getCreatorOrgCount(alice.address)).to.equal(1n);
    expect(await registry.getCreatorOrgId(alice.address, 0)).to.equal(0n);
  });

  it("deploys vault owned by creator and authorizes on router", async function () {
    const { alice, registry, router } = await loadFixture(deployFixture);

    await registry.connect(alice).createOrganization("Pay Co");
    await expect(registry.connect(alice).createVault(0))
      .to.emit(registry, "VaultCreated");

    const org = await registry.getOrganization(0);
    expect(org.vaultCreated).to.equal(true);
    expect(org.vault).to.properAddress;

    const vault = await ethers.getContractAt("PayrollVault", org.vault);
    expect(await vault.owner()).to.equal(alice.address);
    expect(await router.authorizedVaults(org.vault)).to.equal(true);
  });

  it("rejects vault creation by non-creator", async function () {
    const { alice, bob, registry } = await loadFixture(deployFixture);
    await registry.connect(alice).createOrganization("Locked");
    await expect(registry.connect(bob).createVault(0)).to.be.revertedWith("Not org creator");
  });

  it("rejects duplicate vault per org", async function () {
    const { alice, registry } = await loadFixture(deployFixture);
    await registry.connect(alice).createOrganization("Once");
    await registry.connect(alice).createVault(0);
    await expect(registry.connect(alice).createVault(0)).to.be.revertedWith("Vault already exists");
  });

  it("allows multiple orgs per creator", async function () {
    const { alice, registry } = await loadFixture(deployFixture);
    await registry.connect(alice).createOrganization("Org A");
    await registry.connect(alice).createOrganization("Org B");
    expect(await registry.organizationCount()).to.equal(2n);
    expect(await registry.getCreatorOrgCount(alice.address)).to.equal(2n);
  });
});
