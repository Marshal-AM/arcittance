/**
 * Deploy upgraded CrossChainRouter + PayrollOrgRegistry (existing Arc deployment).
 * Required because the on-chain router predates vaultRegistry / registry auth.
 *
 * Run: npx hardhat run scripts/deploy/arc/02_deploy_org_registry.ts --network arcTestnet
 */

import * as fs from "fs";
import * as path from "path";
import { ethers } from "hardhat";
import {
  ARC_TOKEN_MESSENGER,
  USDC_ADDRESS,
} from "../../../config/arc.testnet";

const ADDRESSES_PATH = path.join(__dirname, "../../../deployments/arc/addresses.json");

async function main() {
  const [deployer] = await ethers.getSigners();
  const addresses = JSON.parse(fs.readFileSync(ADDRESSES_PATH, "utf8")) as {
    contracts: {
      PayrollScheduler: string;
      CrossChainRouter: string;
      RemittanceVault?: string;
      PayrollOrgRegistry?: string;
    };
  };

  const scheduler = addresses.contracts.PayrollScheduler;
  const oldRouter   = addresses.contracts.CrossChainRouter;
  if (!scheduler || !oldRouter) {
    throw new Error("PayrollScheduler and CrossChainRouter required in addresses.json");
  }

  const facilitatorPk =
    process.env.FACILITATOR_PRIVATE_KEY ?? process.env.DEPLOYER_PRIVATE_KEY!;
  const orchestratorAddr =
    process.env.ORCHESTRATOR_ADDRESS ??
    new ethers.Wallet(facilitatorPk.startsWith("0x") ? facilitatorPk : `0x${facilitatorPk}`).address;

  console.log("Deployer:", deployer.address);
  console.log("Old router (remittance still uses this on-chain):", oldRouter);

  const RouterF = await ethers.getContractFactory("CrossChainRouter");
  const router  = await RouterF.deploy(
    ARC_TOKEN_MESSENGER,
    USDC_ADDRESS,
    orchestratorAddr,
    { gasLimit: 3_000_000 },
  );
  await router.waitForDeployment();
  const routerAddr = await router.getAddress();
  console.log("New CrossChainRouter:", routerAddr);

  const RegistryF = await ethers.getContractFactory("PayrollOrgRegistry");
  const registry  = await RegistryF.deploy(scheduler, routerAddr, { gasLimit: 4_000_000 });
  await registry.waitForDeployment();
  const registryAddr = await registry.getAddress();
  console.log("PayrollOrgRegistry:", registryAddr);

  await (await router.setVaultRegistry(registryAddr)).wait();
  console.log("vaultRegistry wired");

  const remit = addresses.contracts.RemittanceVault;
  if (remit) {
    await (await router.authorizeVault(remit, true)).wait();
    console.log("RemittanceVault authorized on new router (on-chain remit vault still points at old router)");
  }

  addresses.contracts.CrossChainRouter   = routerAddr;
  addresses.contracts.PayrollOrgRegistry = registryAddr;
  fs.writeFileSync(ADDRESSES_PATH, JSON.stringify(addresses, null, 2) + "\n");

  console.log("\nUpdate frontend/.env.local:");
  console.log(`NEXT_PUBLIC_PAYROLL_ORG_REGISTRY_ADDRESS=${registryAddr}`);
  console.log(`NEXT_PUBLIC_CROSS_CHAIN_ROUTER_ADDRESS=${routerAddr}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
