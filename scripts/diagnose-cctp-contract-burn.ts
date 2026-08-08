/**
 * Deploy CctpBurnProbe and test contract-initiated CCTP burn on Arc testnet.
 * Run: npx hardhat run scripts/diagnose-cctp-contract-burn.ts --network arcTestnet
 */

import { ethers } from "hardhat";

const USDC = "0x3600000000000000000000000000000000000000";
const MESSENGER = "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA";

async function main() {
  const [deployer] = await ethers.getSigners();
  const amount = ethers.parseUnits("0.01", 6);
  const recipient = ethers.zeroPadValue(deployer.address, 32);

  const ProbeF = await ethers.getContractFactory("CctpBurnProbe");
  const probe = await ProbeF.deploy({ gasLimit: 1_500_000 });
  await probe.waitForDeployment();
  const probeAddr = await probe.getAddress();
  console.log("CctpBurnProbe:", probeAddr);

  const usdc = await ethers.getContractAt(
    ["function approve(address,uint256) returns (bool)", "function transfer(address,uint256) returns (bool)"],
    USDC,
    deployer
  );

  await (await usdc.transfer(probeAddr, amount)).wait();
  console.log("Funded probe with", ethers.formatUnits(amount, 6), "USDC");

  const usdcView = await ethers.getContractAt(
    ["function balanceOf(address) view returns (uint256)", "function allowance(address,address) view returns (uint256)"],
    USDC
  );
  console.log("probe balance:", ethers.formatUnits(await usdcView.balanceOf(probeAddr), 6));
  console.log("probe allowance before:", ethers.formatUnits(await usdcView.allowance(probeAddr, MESSENGER), 6));

  try {
    const approveTx = await probe.probeApprove(USDC, MESSENGER, amount);
    await approveTx.wait();
    console.log("probeApprove tx OK");
    console.log("probe allowance after tx:", ethers.formatUnits(await usdcView.allowance(probeAddr, MESSENGER), 6));
  } catch (e: any) {
    console.log("probeApprove FAIL:", e.shortMessage ?? e.message);
  }

  for (const threshold of [0, 1000, 2000]) {
    try {
      await probe.probeBurnWithThreshold.staticCall(
        USDC, MESSENGER, amount, 6, recipient, threshold
      );
      console.log(`probeBurn threshold=${threshold}: staticCall OK`);
    } catch (e: any) {
      console.log(`probeBurn threshold=${threshold}: staticCall FAIL`, e.shortMessage ?? e.message);
    }
  }

  try {
    const gas = await probe.probeBurn.estimateGas(
      USDC, MESSENGER, amount, 6, recipient
    );
    console.log("estimateGas OK:", gas.toString());
    const tx = await probe.probeBurn(USDC, MESSENGER, amount, 6, recipient);
    const receipt = await tx.wait();
    console.log("SUCCESS tx:", receipt?.hash, "status:", receipt?.status);
  } catch (e: any) {
    console.log("FAIL:", e.shortMessage ?? e.message);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
