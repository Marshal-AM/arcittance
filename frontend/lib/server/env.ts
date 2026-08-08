/**
 * Load Circle env vars from root .env (server-side only).
 */
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

let loaded = false;

export function loadServerEnv(): void {
  if (loaded) return;
  const candidates = [
    path.join(process.cwd(), ".env.local"),
    path.join(process.cwd(), ".env"),
    path.join(process.cwd(), "..", ".env"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) dotenv.config({ path: p });
  }
  loaded = true;
}
