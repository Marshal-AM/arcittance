import * as dotenv from "dotenv";
import { ethers } from "ethers";

dotenv.config();

const ARC_USDC = "0x3600000000000000000000000000000000000000";
const BASE_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

async function main() {
  const arc = new ethers.JsonRpcProvider(process.env.ARC_RPC_URL);
  const base = new ethers.JsonRpcProvider(
    process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org"
  );
  const usdcAbi = ["function balanceOf(address) view returns (uint256)"];

  const fac = new ethers.Wallet(process.env.FACILITATOR_PRIVATE_KEY!).address;
  const dep = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY!).address;
  const circleFac = "0x0254ddcc85c370e571a4b7f09a6340a834eb0477";

  console.log("=== Bridge wallet status ===\n");
  console.log("Facilitator EOA (orchestrator, native CCTP):", fac);
  console.log("Circle facilitator wallet (keeper API):     ", circleFac);
  console.log("Deployer:                                 ", dep);

  for (const [label, addr, provider, token] of [
    ["Arc USDC facilitator", fac, arc, ARC_USDC],
    ["Arc USDC deployer", dep, arc, ARC_USDC],
    ["Arc USDC circle API wallet", circleFac, arc, ARC_USDC],
    ["Base USDC facilitator", fac, base, BASE_USDC],
  ] as const) {
    const c = new ethers.Contract(token, usdcAbi, provider);
    const b = await c.balanceOf(addr);
    console.log(`${label}: ${ethers.formatUnits(b, 6)}`);
  }

  console.log(`Arc gas (facilitator):  ${ethers.formatEther(await arc.getBalance(fac))} ETH`);
  console.log(`Base gas (facilitator): ${ethers.formatEther(await base.getBalance(fac))} ETH`);
}

main().catch(console.error);
