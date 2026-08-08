import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

function loadAddresses() {
  const p = path.join(__dirname, "../../deployments/arc/addresses.json");
  return JSON.parse(fs.readFileSync(p, "utf8")) as {
    contracts: { PayrollOrgRegistry: string };
  };
}

/** Org vault from env, or create a throwaway org+vault via PayrollOrgRegistry. */
export async function resolvePayrollVault(owner: ethers.Signer): Promise<string> {
  if (process.env.PAYROLL_VAULT_ADDRESS) {
    return process.env.PAYROLL_VAULT_ADDRESS;
  }

  const { contracts } = loadAddresses();
  if (!contracts.PayrollOrgRegistry) {
    throw new Error(
      "PayrollOrgRegistry not in addresses.json — redeploy with npm run deploy:arc, or set PAYROLL_VAULT_ADDRESS"
    );
  }

  const registry = await ethers.getContractAt(
    "PayrollOrgRegistry",
    contracts.PayrollOrgRegistry,
    owner,
  );
  const tx = await registry.createOrganization(`integration-${Date.now()}`);
  await tx.wait();
  const orgId = (await registry.organizationCount()) - 1n;
  await (await registry.createVault(orgId)).wait();
  const org = await registry.getOrganization(orgId);
  return org.vault;
}
