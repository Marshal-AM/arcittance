/**
 * Probe Circle sandbox capabilities for Phase 10 remit redo.
 *
 * Uses CIRCLE_STABLEFX_API_KEY against https://api-sandbox.circle.com
 * (override with STABLEFX_API_BASE_URL).
 *
 * Run: npx ts-node scripts/probe-circle-sandbox-remit.ts
 *
 * Does NOT print the API key. Prints HTTP status + truncated JSON only.
 */
import * as dotenv from "dotenv";
import * as path from "path";
import { randomUUID } from "crypto";

dotenv.config({ path: path.join(__dirname, "../.env") });

const BASE =
  process.env.STABLEFX_API_BASE_URL?.replace(/\/$/, "") ||
  "https://api-sandbox.circle.com";

const KEY = process.env.CIRCLE_STABLEFX_API_KEY?.trim();

async function probe(
  name: string,
  method: string,
  pathName: string,
  body?: Record<string, unknown>
): Promise<void> {
  console.log(`\n===== ${name} =====`);
  console.log(`${method} ${pathName}`);

  if (!KEY) {
    console.log("STATUS: SKIP (CIRCLE_STABLEFX_API_KEY missing)");
    return;
  }

  const res = await fetch(`${BASE}${pathName}`, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${KEY}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let preview = text;
  if (preview.length > 600) preview = `${preview.slice(0, 600)}...`;

  console.log(`STATUS: ${res.status}`);
  if (preview) console.log(preview);
}

async function main(): Promise<void> {
  console.log("Circle sandbox remit capability probe");
  console.log(`Base URL: ${BASE}`);
  console.log(`Key present: ${Boolean(KEY)} (value not printed)`);

  // 1) Known-good StableFX baseline
  await probe("StableFX quote USDC→EURC", "POST", "/v1/exchange/stablefx/quotes", {
    from: { currency: "USDC", amount: "10" },
    to: { currency: "EURC" },
    tenor: "instant",
    type: "tradable",
    recipientAddress: "0x1f531ce3c418bbd830d06138a9e5b5eacfdfb3d6",
  });

  // 2) Payins — transient payment intent on Arc
  await probe("Payin paymentIntent transient ARC", "POST", "/v1/paymentIntents", {
    idempotencyKey: randomUUID(),
    type: "transient",
    amount: { amount: "10.00", currency: "USD" },
    settlementCurrency: "USD",
    paymentMethods: [{ type: "blockchain", chain: "ARC" }],
  });

  // 3) Payins — continuous intent alternate shape
  await probe("Payin paymentIntent continuous ARC", "POST", "/v1/paymentIntents", {
    idempotencyKey: randomUUID(),
    currency: "USD",
    settlementCurrency: "USD",
    paymentMethods: [{ type: "blockchain", chain: "ARC" }],
  });

  // 4) Address book (payouts prerequisite)
  await probe("AddressBook recipients list", "GET", "/v1/addressBook/recipients?pageSize=1");

  // 5) Custody / wallets
  await probe("Wallets list", "GET", "/v1/wallets?pageSize=1");

  // 6) Mint balances
  await probe("Balances", "GET", "/v1/balances");
  await probe("Business account balances", "GET", "/v1/businessAccount/balances");

  // 7) Payouts list (read-only)
  await probe("Payouts list", "GET", "/v1/payouts?pageSize=1");

  console.log("\n===== DONE =====");
  console.log(
    "Interpret: 200/201 = product available; 401/403 = key lacks product; other 4xx = schema/entity issue."
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
