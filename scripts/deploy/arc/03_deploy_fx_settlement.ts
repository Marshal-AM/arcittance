/**
 * Deploy FXSettlementEscrow (Phase 10 PvP registry) on Arc testnet.
 * Run: npx hardhat run scripts/deploy/arc/03_deploy_fx_settlement.ts --network arcTestnet
 */

import * as fs from "fs";
import * as path from "path";
import { ethers } from "hardhat";

const ADDRESSES_PATH = path.join(__dirname, "../../../deployments/arc/addresses.json");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("=== Deploy FXSettlementEscrow ===");
  console.log(`Deployer: ${deployer.address}`);

  const facilitatorPk =
    process.env.FACILITATOR_PRIVATE_KEY ?? process.env.DEPLOYER_PRIVATE_KEY!;
  const orchestratorAddr =
    process.env.ORCHESTRATOR_ADDRESS ??
    new ethers.Wallet(
      facilitatorPk.startsWith("0x") ? facilitatorPk : `0x${facilitatorPk}`
    ).address;

  const F = await ethers.getContractFactory("FXSettlementEscrow");
  const escrow = await F.deploy(orchestratorAddr, { gasLimit: 2_000_000 });
  await escrow.waitForDeployment();
  const escrowAddr = await escrow.getAddress();
  console.log(`FXSettlementEscrow: ${escrowAddr}`);
  console.log(`Orchestrator:       ${orchestratorAddr}`);

  const addresses = JSON.parse(fs.readFileSync(ADDRESSES_PATH, "utf8")) as {
    contracts: Record<string, string>;
    deployedAt?: string;
  };
  addresses.contracts.FXSettlementEscrow = escrowAddr;
  addresses.deployedAt = new Date().toISOString();
  fs.writeFileSync(ADDRESSES_PATH, JSON.stringify(addresses, null, 2) + "\n");
  console.log("Updated deployments/arc/addresses.json");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
