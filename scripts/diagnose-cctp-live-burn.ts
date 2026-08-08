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

  const code = await provider.getCode(MESSENGER);
  console.log("messenger code len:", code.length);

  const erc20 = new ethers.Contract(USDC, [
    "function approve(address,uint256) returns (bool)",
    "function allowance(address,address) view returns (uint256)",
  ], wallet);

  const messenger = new ethers.Contract(MESSENGER, [
    "function depositForBurn(uint256,uint32,bytes32,address,bytes32,uint256,uint32) returns (uint64)",
  ], wallet);

  const approveTx = await erc20.approve(MESSENGER, amount);
  await approveTx.wait();
  console.log("allowance:", (await erc20.allowance(wallet.address, MESSENGER)).toString());

  try {
    const gas = await messenger.depositForBurn.estimateGas(
      amount, 6, recipient, USDC, ethers.ZeroHash, 0n, 1000
    );
    console.log("estimateGas OK:", gas.toString());
  } catch (e: any) {
    console.log("estimateGas FAIL:", e.shortMessage ?? e.message);
  }

  try {
    const tx = await messenger.depositForBurn(
      amount, 6, recipient, USDC, ethers.ZeroHash, 0n, 1000
    );
    const receipt = await tx.wait();
    console.log("LIVE BURN OK:", receipt?.hash, "status:", receipt?.status);
  } catch (e: any) {
    console.log("LIVE BURN FAIL:", e.shortMessage ?? e.message);
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
