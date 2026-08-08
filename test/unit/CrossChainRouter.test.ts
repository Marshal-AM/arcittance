import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

async function deployRouterFixture() {
  const [owner, vault, orchestrator, recipient] = await ethers.getSigners();

  const MockERC20F = await ethers.getContractFactory("MockERC20");
  const usdc = await MockERC20F.deploy("USDC", "USDC", 6);

  const MessengerF = await ethers.getContractFactory("MockTokenMessenger");
  const messenger = await MessengerF.deploy();

  const RouterF = await ethers.getContractFactory("CrossChainRouter");
  const router = await RouterF.deploy(
    await messenger.getAddress(),
    await usdc.getAddress(),
    orchestrator.address
  );

  await router.authorizeVault(vault.address, true);

  const amount = ethers.parseUnits("100", 6);
  await usdc.mint(vault.address, amount);
  await usdc.connect(vault).approve(await router.getAddress(), amount);

  return { router, usdc, messenger, owner, vault, orchestrator, recipient, amount };
}

describe("CrossChainRouter", function () {
  it("routeCCTP forwards USDC to orchestrator and emits RouteCCTP", async function () {
    const { router, usdc, vault, orchestrator, recipient, amount } = await loadFixture(deployRouterFixture);

    await expect(
      router.connect(vault).routeCCTP(
        await usdc.getAddress(),
        amount,
        6,
        recipient.address
      )
    )
      .to.emit(router, "RouteCCTP")
      .withArgs(await usdc.getAddress(), amount, 6, recipient.address, 0);

    expect(await usdc.balanceOf(orchestrator.address)).to.equal(amount);
    expect(await usdc.balanceOf(await router.getAddress())).to.equal(0);
  });

  it("routeGateway escrows USDC and emits GatewayPayoutRequested", async function () {
    const { router, usdc, vault, recipient, amount } = await loadFixture(deployRouterFixture);

    const tx = await router.connect(vault).routeGateway(
      await usdc.getAddress(),
      amount,
      6,
      recipient.address
    );
    const receipt = await tx.wait();
    const event = receipt!.logs.find((l) => {
      try {
        return router.interface.parseLog(l)?.name === "GatewayPayoutRequested";
      } catch {
        return false;
      }
    });
    expect(event).to.not.be.undefined;

    expect(await usdc.balanceOf(await router.getAddress())).to.equal(amount);
  });

  it("markGatewayFulfilled only callable by orchestrator", async function () {
    const { router, usdc, vault, orchestrator, recipient, amount, owner } =
      await loadFixture(deployRouterFixture);

    const tx = await router.connect(vault).routeGateway(
      await usdc.getAddress(),
      amount,
      6,
      recipient.address
    );
    const receipt = await tx.wait();
    const parsed = router.interface.parseLog(receipt!.logs[receipt!.logs.length - 1]);
    const requestId = parsed!.args.requestId;

    await expect(
      router.connect(owner).markGatewayFulfilled(requestId, ethers.id("ref"))
    ).to.be.revertedWith("Only orchestrator");

    await expect(
      router.connect(orchestrator).markGatewayFulfilled(requestId, ethers.id("ref"))
    )
      .to.emit(router, "GatewayPayoutFulfilled")
      .withArgs(requestId, ethers.id("ref"));
  });

  it("rejects unauthorized vault callers", async function () {
    const { router, usdc, recipient, amount, owner } = await loadFixture(deployRouterFixture);

    await expect(
      router.connect(owner).routeCCTP(await usdc.getAddress(), amount, 6, recipient.address)
    ).to.be.revertedWith("Only vault");
  });
});
