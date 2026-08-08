import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("RemittanceVault", function () {
  async function deployFixture() {
    const [owner, sender, recipient, treasury] = await ethers.getSigners();

    const MockERC20F = await ethers.getContractFactory("MockERC20");
    const usdc = await MockERC20F.deploy("USDC", "USDC", 6);
    const RouterF = await ethers.getContractFactory("MockCrossChainRouter");
    const router = await RouterF.deploy();

    const RemitF = await ethers.getContractFactory("RemittanceVault");
    const vault = await RemitF.deploy(
      await router.getAddress(),
      await usdc.getAddress(),
      treasury.address
    );

    const amount = ethers.parseUnits("100", 6);
    await usdc.mint(sender.address, amount * 10n);

    return { vault, usdc, router, owner, sender, recipient, treasury, amount };
  }

  it("sends Arc-local USDC to recipient", async function () {
    const { vault, usdc, sender, recipient, amount } = await loadFixture(deployFixture);
    const net = amount;
    await usdc.connect(sender).approve(await vault.getAddress(), amount);

    await expect(
      vault.connect(sender).sendRemittance(
        await usdc.getAddress(),
        amount,
        recipient.address,
        0,
        0,
        ethers.ZeroHash
      )
    ).to.emit(vault, "RemittanceSent");

    expect(await usdc.balanceOf(recipient.address)).to.equal(net);
  });

  it("deducts protocol fee to treasury", async function () {
    const { vault, usdc, sender, recipient, treasury, amount } = await loadFixture(deployFixture);
    await vault.setFeeBps(100); // 1%
    await usdc.connect(sender).approve(await vault.getAddress(), amount);

    await vault.connect(sender).sendRemittance(
      await usdc.getAddress(),
      amount,
      recipient.address,
      0,
      0,
      ethers.ZeroHash
    );

    const fee = amount / 100n;
    expect(await usdc.balanceOf(treasury.address)).to.equal(fee);
    expect(await usdc.balanceOf(recipient.address)).to.equal(amount - fee);
  });
});
