/**
 * Deploy Arcittance contracts to Arc testnet.
 *
 * Run: npx hardhat run scripts/deploy/arc/01_deploy_contracts.ts --network arcTestnet
 */

import * as fs   from "fs";
import * as path from "path";
import { ethers } from "hardhat";
import {
  ARC_CHAIN_ID,
  USDC_ADDRESS,
  EURC_ADDRESS,
  ARC_CCTP_DOMAIN,
  ARC_TOKEN_MESSENGER,
} from "../../../config/arc.testnet";

const ADDRESSES_PATH = path.join(__dirname, "../../../deployments/arc/addresses.json");

async function main() {
  if (process.env.ARC_NETWORK && process.env.ARC_NETWORK !== "arc:testnet") {
    throw new Error(`ARC_NETWORK must be arc:testnet (got ${process.env.ARC_NETWORK})`);
  }

  const [deployer] = await ethers.getSigners();
  console.log("=== Deploy to Arc Testnet ===");
  console.log(`Deployer: ${deployer.address}`);

  const SchedulerF = await ethers.getContractFactory("PayrollScheduler");
  const scheduler  = await SchedulerF.deploy({ gasLimit: 2_000_000 });
  await scheduler.waitForDeployment();
  const schedulerAddr = await scheduler.getAddress();

  const RouterF = await ethers.getContractFactory("CrossChainRouter");
  const facilitatorPk =
    process.env.FACILITATOR_PRIVATE_KEY ?? process.env.DEPLOYER_PRIVATE_KEY!;
  const orchestratorAddr =
    process.env.ORCHESTRATOR_ADDRESS ??
    new ethers.Wallet(facilitatorPk.startsWith("0x") ? facilitatorPk : `0x${facilitatorPk}`).address;

  const router  = await RouterF.deploy(
    ARC_TOKEN_MESSENGER,
    USDC_ADDRESS,
    orchestratorAddr,
    { gasLimit: 3_000_000 }
  );
  await router.waitForDeployment();
  const routerAddr = await router.getAddress();

  const RegistryF = await ethers.getContractFactory("PayrollOrgRegistry");
  const registry  = await RegistryF.deploy(schedulerAddr, routerAddr, { gasLimit: 4_000_000 });
  await registry.waitForDeployment();
  const registryAddr = await registry.getAddress();
  await (await router.setVaultRegistry(registryAddr)).wait();

  const treasury = process.env.TREASURY_ADDRESS ?? deployer.address;
  const RemitF = await ethers.getContractFactory("RemittanceVault");
  const remit  = await RemitF.deploy(routerAddr, USDC_ADDRESS, treasury, { gasLimit: 2_500_000 });
  await remit.waitForDeployment();
  const remitAddr = await remit.getAddress();
  await (await router.authorizeVault(remitAddr, true)).wait();

  const EscrowF = await ethers.getContractFactory("ConditionalEscrow");
  const escrow  = await EscrowF.deploy({ gasLimit: 2_000_000 });
  await escrow.waitForDeployment();
  const escrowAddr = await escrow.getAddress();

  const SubF = await ethers.getContractFactory("SubscriptionManager");
  const sub  = await SubF.deploy({ gasLimit: 2_000_000 });
  await sub.waitForDeployment();
  const subAddr = await sub.getAddress();

  const addresses = {
    network: "arc:testnet",
    chainId: ARC_CHAIN_ID,
    tokens: { USDC: USDC_ADDRESS, EURC: EURC_ADDRESS },
    cctpDomain: ARC_CCTP_DOMAIN,
    cctp: { tokenMessenger: ARC_TOKEN_MESSENGER },
    contracts: {
      PayrollScheduler:    schedulerAddr,
      CrossChainRouter:    routerAddr,
      PayrollOrgRegistry:  registryAddr,
      RemittanceVault:     remitAddr,
      ConditionalEscrow:   escrowAddr,
      SubscriptionManager: subAddr,
    },
    deployerAddress: deployer.address,
    deployedAt: new Date().toISOString(),
  };

  fs.writeFileSync(ADDRESSES_PATH, JSON.stringify(addresses, null, 2) + "\n");
  console.log(JSON.stringify(addresses.contracts, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
