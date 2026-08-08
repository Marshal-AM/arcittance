import * as dotenv from "dotenv";
import { ethers } from "ethers";

dotenv.config();

const USDC = "0x3600000000000000000000000000000000000000";
const MESSENGER = "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA";

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.ARC_RPC_URL);
  const wallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY!, provider);
  const amount = ethers.parseUnits("0.01", 6);
  const recipient = ethers.zeroPadValue(wallet.address, 32);
  const domain = 6;

  const erc20 = new ethers.Contract(USDC, [
    "function approve(address,uint256) returns (bool)",
    "function balanceOf(address) view returns (uint256)",
  ], wallet);

  const messenger = new ethers.Contract(MESSENGER, [
    "function depositForBurn(uint256,uint32,bytes32,address,bytes32,uint256,uint32) returns (uint64)",
  ], wallet);

  const bal = await erc20.balanceOf(wallet.address);
  console.log("Deployer USDC:", ethers.formatUnits(bal, 6));

  for (const threshold of [0, 1000, 2000, 5000]) {
    try {
      const tx = await erc20.approve(MESSENGER, amount);
      await tx.wait();
      await messenger.depositForBurn.staticCall(
        amount, domain, recipient, USDC, ethers.ZeroHash, 0n, threshold
      );
      console.log(`✓ staticCall OK — minFinalityThreshold=${threshold}`);
    } catch (e: any) {
      console.log(`✗ threshold=${threshold}:`, e.shortMessage ?? e.reason ?? e.message);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
