/**
 * Operator script: remittance + receipt smoke.
 * Run: npx ts-node scripts/testnet/05_test_remittance_flow.ts
 */

import * as dotenv from "dotenv";
import { screenAddress } from "../../circle/src/compliance";

dotenv.config();

async function main(): Promise<void> {
  console.log("=== Remittance flow test (05) ===\n");

  const allowed = screenAddress("0x80568CF6687392bD74f15b1C600029499D97Ff40");
  if (!allowed.allowed) throw new Error("Expected allowed address");

  const blocked = screenAddress("0x000000000000000000000000000000000000dEaD");
  if (blocked.allowed) throw new Error("Expected blocked address");

  console.log("✓ Compliance screening");

  if (!process.env.SUPABASE_URL) {
    console.log("  Supabase not configured — skip DB receipt test");
  } else {
    console.log("  Supabase configured — run /remit E2E for full receipt trail");
  }

  console.log("\n✓ Remittance flow prerequisites OK");
  console.log("For live user-wallet send, use frontend /remit with Circle OTP");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
