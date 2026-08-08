/**
 * Circle wire-bank create matrix — test the three "maybe it's us" hypotheses:
 *   1. Fresh UUID idempotencyKey every call (vs reused key after failure)
 *   2. Whitelisted sandbox account/routing (12340010 / 121000248) vs custom fakes
 *   3. Path: /v1/businessAccount/banks/wires (Mint) vs /v1/banks/wires (legacy/DAA)
 *
 *   npx ts-node scripts/test-mint-wire-variants.ts
 *   npm run test:mint-wire-variants
 */
import * as dotenv from "dotenv";
import * as path from "path";
import { randomUUID } from "crypto";

dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../frontend/.env.local") });

const BASE =
  process.env.CIRCLE_MINT_BASE_URL?.replace(/\/$/, "") ||
  process.env.STABLEFX_API_BASE_URL?.replace(/\/$/, "") ||
  "https://api-sandbox.circle.com";

const DOCS_BILLING = {
  name: "Satoshi Nakamoto",
  city: "Boston",
  country: "US",
  line1: "100 Money Street",
  district: "MA",
  postalCode: "01234",
};

const DOCS_BANK = {
  bankName: "WELLS FARGO BANK, NA",
  city: "San Francisco",
  country: "US",
  line1: "420 Montgomery Street",
  district: "CA",
};

type Case = {
  name: string;
  path: string;
  body: Record<string, unknown>;
};

async function post(
  apiKey: string,
  path: string,
  body: Record<string, unknown>
): Promise<{ status: number; text: string; ms: number }> {
  const t0 = Date.now();
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, text, ms: Date.now() - t0 };
}

function summarizeBody(text: string): string {
  try {
    const j = JSON.parse(text) as {
      data?: { id?: string; status?: string };
      message?: string;
      response?: { status?: { message?: string; externalMessage?: string } };
    };
    if (j.data?.id) return `OK id=${j.data.id} status=${j.data.status}`;
    const msg =
      j.response?.status?.message ??
      j.message ??
      text.slice(0, 220);
    return msg.replace(/\s+/g, " ").slice(0, 280);
  } catch {
    return text.slice(0, 220);
  }
}

async function main(): Promise<void> {
  const apiKey =
    process.env.CIRCLE_MINT_API_KEY?.trim() ||
    process.env.CIRCLE_STABLEFX_API_KEY?.trim();
  if (!apiKey) {
    console.error("CIRCLE_MINT_API_KEY or CIRCLE_STABLEFX_API_KEY required");
    process.exit(1);
  }

  console.log("=== Mint wire-create variant matrix ===");
  console.log("Base:", BASE);
  console.log("Key prefix:", apiKey.slice(0, 16) + "…");
  console.log("");

  // Sanity: balances (proves auth + Mint base)
  {
    const r = await fetch(`${BASE}/v1/businessAccount/balances`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    });
    console.log(`GET /v1/businessAccount/balances → ${r.status}`);
    console.log(" ", (await r.text()).slice(0, 200));
  }

  const reusedKey = randomUUID();
  const cases: Case[] = [
    {
      name: "A) Mint path + docs account/routing + fresh UUID",
      path: "/v1/businessAccount/banks/wires",
      body: {
        idempotencyKey: randomUUID(),
        accountNumber: "12340010",
        routingNumber: "121000248",
        billingDetails: DOCS_BILLING,
        bankAddress: DOCS_BANK,
      },
    },
    {
      name: "B) Mint path + docs numbers + SAME idempotencyKey (1st)",
      path: "/v1/businessAccount/banks/wires",
      body: {
        idempotencyKey: reusedKey,
        accountNumber: "12340010",
        routingNumber: "121000248",
        billingDetails: DOCS_BILLING,
        bankAddress: DOCS_BANK,
      },
    },
    {
      name: "C) Mint path + docs numbers + SAME idempotencyKey (2nd retry)",
      path: "/v1/businessAccount/banks/wires",
      body: {
        idempotencyKey: reusedKey,
        accountNumber: "12340010",
        routingNumber: "121000248",
        billingDetails: DOCS_BILLING,
        bankAddress: DOCS_BANK,
      },
    },
    {
      name: "D) Mint path + random account number (custom fake)",
      path: "/v1/businessAccount/banks/wires",
      body: {
        idempotencyKey: randomUUID(),
        accountNumber: String(Math.floor(100000000 + Math.random() * 900000000)),
        routingNumber: "121000248",
        billingDetails: DOCS_BILLING,
        bankAddress: DOCS_BANK,
      },
    },
    {
      name: "E) Mint path + deposit-fiat howto bankAddress variant",
      path: "/v1/businessAccount/banks/wires",
      body: {
        idempotencyKey: randomUUID(),
        accountNumber: "12340010",
        routingNumber: "121000248",
        billingDetails: DOCS_BILLING,
        bankAddress: {
          bankName: "SAN FRANCISCO",
          city: "SAN FRANCISCO",
          country: "US",
          line1: "100 Money Street",
          district: "CA",
        },
      },
    },
    {
      name: "F) Legacy/DAA path /v1/banks/wires + docs numbers + fresh UUID",
      path: "/v1/banks/wires",
      body: {
        idempotencyKey: randomUUID(),
        accountNumber: "12340010",
        routingNumber: "121000248",
        billingDetails: DOCS_BILLING,
        bankAddress: DOCS_BANK,
      },
    },
    {
      name: "G) Legacy/DAA path LIST GET /v1/banks/wires (route exists?)",
      path: "/v1/banks/wires",
      body: {}, // marker — handled as GET below
    },
  ];

  let anySuccess = false;

  for (const c of cases) {
    console.log(`\n── ${c.name}`);
    console.log(`   ${c.path}`);

    if (c.name.startsWith("G)")) {
      const t0 = Date.now();
      const res = await fetch(`${BASE}${c.path}`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
      });
      const text = await res.text();
      console.log(`   → ${res.status} (${Date.now() - t0}ms)`);
      console.log(`   ${summarizeBody(text)}`);
      continue;
    }

    console.log(`   idempotencyKey=${c.body.idempotencyKey}`);
    console.log(
      `   account=${c.body.accountNumber} routing=${c.body.routingNumber}`
    );
    const result = await post(apiKey, c.path, c.body);
    console.log(`   → ${result.status} (${result.ms}ms)`);
    console.log(`   ${summarizeBody(result.text)}`);
    if (result.status >= 200 && result.status < 300) anySuccess = true;
  }

  console.log("\n=== Verdict ===");
  if (anySuccess) {
    console.log("At least one create variant SUCCEEDED — use that path/payload in Path B.");
    process.exit(0);
  }
  console.log(
    "All create variants FAILED. If status is still 500 + eft-sandbox-eft,\n" +
      "this is Circle sandbox infrastructure — not idempotencyKey / account number / route mixup.\n" +
      "(Our Path B already uses fresh UUID + 12340010/121000248 + businessAccount path.)"
  );
  process.exit(2);
}

main().catch((e) => {
  console.error("FATAL:", e.message ?? e);
  process.exit(1);
});
