import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("FXSettlementEscrow", function () {
  async function deployFixture() {
    const [owner, orchestrator, payer, other] = await ethers.getSigners();
    const F = await ethers.getContractFactory("FXSettlementEscrow");
    const escrow = await F.deploy(orchestrator.address);
    return { owner, orchestrator, payer, other, escrow };
  }

  const remittanceRef = ethers.id("remittance-1");
  const tradeId = ethers.id("stablefx-trade-1");
  const fxTx = ethers.id("fx-settle-tx");
  const payoutTx = ethers.id("payout-tx");

  it("opens settlement and confirms both legs", async function () {
    const { orchestrator, payer, escrow } = await loadFixture(deployFixture);

    await expect(
      escrow.connect(orchestrator).open(remittanceRef, tradeId, payer.address, 1_000_000n)
    )
      .to.emit(escrow, "SettlementOpened")
      .withArgs(remittanceRef, tradeId, payer.address, 1_000_000n);

    expect(await escrow.isSettled(remittanceRef)).to.equal(false);

    await expect(escrow.connect(orchestrator).confirmFx(remittanceRef, fxTx))
      .to.emit(escrow, "FxConfirmed")
      .withArgs(remittanceRef, fxTx);

    await expect(escrow.connect(orchestrator).confirmPayout(remittanceRef, payoutTx))
      .to.emit(escrow, "PayoutConfirmed")
      .withArgs(remittanceRef, payoutTx);

    expect(await escrow.isSettled(remittanceRef)).to.equal(true);
    const s = await escrow.getSettlement(remittanceRef);
    expect(s.fxConfirmed).to.equal(true);
    expect(s.payoutConfirmed).to.equal(true);
    expect(s.usdcAmount).to.equal(1_000_000n);
  });

  it("rejects payout before FX confirmation", async function () {
    const { orchestrator, payer, escrow } = await loadFixture(deployFixture);
    await escrow.connect(orchestrator).open(remittanceRef, tradeId, payer.address, 100n);
    await expect(
      escrow.connect(orchestrator).confirmPayout(remittanceRef, payoutTx)
    ).to.be.revertedWith("FX not confirmed");
  });

  it("rejects non-orchestrator opens", async function () {
    const { other, payer, escrow } = await loadFixture(deployFixture);
    await expect(
      escrow.connect(other).open(remittanceRef, tradeId, payer.address, 100n)
    ).to.be.revertedWith("Not orchestrator");
  });

  it("allows owner as orchestrator", async function () {
    const { owner, payer, escrow } = await loadFixture(deployFixture);
    await escrow.connect(owner).open(remittanceRef, tradeId, payer.address, 50n);
    const s = await escrow.getSettlement(remittanceRef);
    expect(s.opened).to.equal(true);
  });
});
