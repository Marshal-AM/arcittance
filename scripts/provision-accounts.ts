/**
 * Derive public addresses for all testnet personas from private keys in .env.
 * Writes config/accounts.testnet.json (addresses only — never private keys).
 *
 * Run: npm run provision:accounts
 */

import * as dotenv from "dotenv";
import * as fs     from "fs";
import * as path   from "path";
import { privateKeyToAccount } from "viem/accounts";
import {
  ARC_CHAIN_ID,
  ARC_NETWORK,
  ACCOUNT_ROLES,
  ROLE_ENV_KEYS,
  type AccountRole,
} from "../config/arc.testnet";

dotenv.config();

function normalizeKey(raw: string): `0x${string}` {
  const trimmed = raw.trim();
  const withPrefix = trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
  if (withPrefix.length !== 66) {
    throw new Error(`Invalid private key length for env var`);
  }
  return withPrefix as `0x${string}`;
}

function main(): void {
  const accounts: Partial<Record<AccountRole, string>> = {};

  for (const role of ACCOUNT_ROLES) {
    const envKey = ROLE_ENV_KEYS[role];
    const raw    = process.env[envKey];
    if (!raw || raw.trim() === "") {
      throw new Error(`Missing ${envKey} for role "${role}"`);
    }
    const account = privateKeyToAccount(normalizeKey(raw));
    accounts[role] = account.address;
    console.log(`  ${role}: ${account.address}`);
  }

  const out = {
    network: ARC_NETWORK,
    chainId: ARC_CHAIN_ID,
    accounts,
    provisionedAt: new Date().toISOString(),
  };

  const outPath = path.join(__dirname, "../config/accounts.testnet.json");
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");

  console.log(`\nWrote ${outPath}`);
  console.log("\nFund each address with USDC via https://faucet.circle.com (Arc Testnet)");
  console.log("Required non-zero balances: Arcittance-deployer, Arcittance-keeper, Arcittance-facilitator");
}

main();
