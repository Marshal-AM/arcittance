/**
 * Shared deploy utilities for Arc testnet scripts.
 */
import * as dotenv from "dotenv";
import * as fs     from "fs";
import * as path   from "path";
import {
  ARC_CHAIN_ID,
  ARC_RPC_URL,
  ARC_EXPLORER_URL,
} from "../../config/arc.testnet";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

export { ARC_CHAIN_ID, ARC_RPC_URL, ARC_EXPLORER_URL };

const ADDRESSES_PATH = path.join(__dirname, "../../deployments/arc/addresses.json");

export function loadAddresses(): Record<string, unknown> {
  if (!fs.existsSync(ADDRESSES_PATH)) return {};
  return JSON.parse(fs.readFileSync(ADDRESSES_PATH, "utf8"));
}

export function saveAddresses(data: Record<string, unknown>): void {
  const dir = path.dirname(ADDRESSES_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const existing = loadAddresses();
  const merged   = { ...existing, ...data, updatedAt: new Date().toISOString() };
  fs.writeFileSync(ADDRESSES_PATH, JSON.stringify(merged, null, 2) + "\n");
  console.log(`addresses.json updated: ${ADDRESSES_PATH}`);
}

export function log(msg: string): void {
  console.log(msg);
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
