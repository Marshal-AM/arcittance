/**
 * Isolated Circle Mint bank-rail probe (docs/bank.md).
 *
 * Walks the sandbox onramp + offramp without touching Path B app code:
 *   1. Link wire bank  (POST /v1/businessAccount/banks/wires)
 *   2. Wire instructions (GET  .../banks/wires/{id}/instructions)
 *   3. Mock deposit     (POST /v1/mocks/payments/wire)
 *   4. Verify balances  (GET  /v1/businessAccount/balances | deposits)
 *   5. Offramp payout   (POST /v1/businessAccount/payouts)  [optional]
 *   6. Onchain mint     (POST /v1/businessAccount/transfers) [optional]
 *
 * Usage:
 *   npx ts-node --project scripts/tsconfig.json scripts/test-mint-bank-rail.ts
 *   npm run test:mint-bank-rail
 *
 * Flags:
 *   --amount=10              Deposit / payout size (USD, default 10)
 *   --bank-id=<uuid>         Reuse an existing wire bank (skip create)
 *   --skip-offramp           Stop after deposit / balance check
 *   --onchain                After deposit, mint to facilitator EOA on Arc
 *   --poll-seconds=120       How long to wait for deposit to settle (default 120)
 *
 * Requires CIRCLE_MINT_API_KEY or CIRCLE_STABLEFX_API_KEY in .env
 */
import * as dotenv from "dotenv";
import * as path from "path";
import { randomUUID } from "crypto";

dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../frontend/.env.local") });

type StepResult = { ok: boolean; detail?: string };

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function logStep(n: number, title: string): void {
  console.log(`\n── ${n}. ${title} ──`);
}

function fail(msg: string): never {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
}

async function main(): Promise<void> {
  const amount = arg("amount") ?? "10.00";
  const reuseBankId = arg("bank-id");
  const skipOfframp = hasFlag("skip-offramp");
  const doOnchain = hasFlag("onchain");
  const pollSeconds = Number(arg("poll-seconds") ?? "120");

  const key =
    process.env.CIRCLE_MINT_API_KEY?.trim() ||
    process.env.CIRCLE_STABLEFX_API_KEY?.trim();
  if (!key) {
    fail("CIRCLE_MINT_API_KEY or CIRCLE_STABLEFX_API_KEY required");
  }

  const {
    getMintBaseUrl,
    mintFetch,
  } = await import("../circle/src/mint-http");
  const {
    createSandboxBankAccount,
    listWireBankAccounts,
    getWireInstructions,
    simulateWireDeposit,
    listDeposits,
    isCircleEftSandboxOutage,
  } = await import("../circle/src/ramp-client");
  const { getBusinessBalances } = await import("../circle/src/custody-client");
  const {
    createBusinessBankPayout,
    getBusinessBankPayout,
    createRecipientAddress,
    mintToOnchainWallet,
    getBusinessTransfer,
  } = await import("../circle/src/mint-client");

  console.log("=== Mint bank rail probe (docs/bank.md) ===");
  console.log(`Base:   ${getMintBaseUrl()}`);
  console.log(`Amount: ${Number(amount).toFixed(2)} USD`);
  console.log(`Flags:  skip-offramp=${skipOfframp} onchain=${doOnchain} bank-id=${reuseBankId ?? "(create)"}`);

  // ── balances before ──────────────────────────────────────────────
  logStep(0, "Snapshot Mint balances (before)");
  const before = await getBusinessBalances();
  const beforeUsd =
    before.available.find((a) => a.currency === "USD")?.amount ?? "0";
  console.log("Available:", JSON.stringify(before.available));
  console.log("USD before:", beforeUsd);

  // ── 1. Link bank ─────────────────────────────────────────────────
  logStep(1, "Link wire bank account");
  let bankId: string;
  let bankCreate: StepResult;

  if (reuseBankId) {
    bankId = reuseBankId;
    bankCreate = { ok: true, detail: `reused --bank-id=${bankId}` };
    console.log("Reusing bank id:", bankId);
  } else {
    try {
      const existing = await listWireBankAccounts();
      console.log(`Existing wire banks: ${existing.length}`);
      if (existing[0]) {
        console.log("  first:", existing[0].id, existing[0].status ?? "");
      }

      const bank = await createSandboxBankAccount({
        description: `Arcittance bank.md probe ${new Date().toISOString()}`,
      });
      bankId = bank.id;
      bankCreate = { ok: true, detail: `created ${bankId} status=${bank.status}` };
      console.log("Created bank id:", bankId);
      console.log("trackingRef (create):", bank.trackingRef ?? "(none)");
      console.log("raw keys:", Object.keys(bank.raw).join(", "));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      bankCreate = { ok: false, detail: msg };
      console.error("Create bank FAILED:", msg);
      if (isCircleEftSandboxOutage(err)) {
        console.error(
          "\n→ Circle sandbox EFT is down (eft-sandbox-eft retries exhausted).\n" +
            "  This is the same failure Path B hits. Not an Arcittance payload bug —\n" +
            "  Circle's documented curl body fails the same way.\n" +
            "  Retry later, or pass --bank-id=<uuid> if you already have a linked bank."
        );
      }
      // Still useful: list + balances succeeded; exit with clear code
      printSummary({ bankCreate, deposit: { ok: false }, offramp: { ok: false }, onchain: { ok: false } });
      process.exit(2);
    }
  }

  // ── 2. Instructions ──────────────────────────────────────────────
  logStep(2, "Get wire instructions");
  let trackingRef: string | undefined;
  let van: string | undefined;
  try {
    const instructions = await getWireInstructions(bankId);
    trackingRef = instructions.trackingRef;
    van = instructions.beneficiaryAccountNumber;
    console.log("trackingRef:", trackingRef ?? "(missing)");
    console.log("VAN (beneficiaryBank.accountNumber):", van ?? "(missing)");
    console.log(
      "instruction keys:",
      Object.keys(instructions.raw ?? {}).join(", ")
    );
    if (!trackingRef || !van) {
      fail("Wire instructions missing trackingRef or VAN — cannot mock deposit");
    }
  } catch (err) {
    fail(`Instructions failed: ${err instanceof Error ? err.message : err}`);
  }

  // ── 3. Mock deposit ──────────────────────────────────────────────
  logStep(3, "Simulate mock wire deposit (sandbox)");
  let deposit: StepResult = { ok: false };
  try {
    const mock = await simulateWireDeposit({
      amount: Number(amount).toFixed(2),
      currency: "USD",
      trackingRef: trackingRef!,
      beneficiaryAccountNumber: van!,
    });
    console.log("Mock response id:", mock.id ?? "(none)", "status:", mock.status ?? "(none)");
    console.log("Mock raw:", JSON.stringify(mock.raw).slice(0, 400));
    deposit = { ok: true, detail: `mock status=${mock.status}` };
  } catch (err) {
    deposit = { ok: false, detail: err instanceof Error ? err.message : String(err) };
    console.error("Mock deposit FAILED:", deposit.detail);
    printSummary({ bankCreate, deposit, offramp: { ok: false }, onchain: { ok: false } });
    process.exit(3);
  }

  // ── 4. Verify landed ─────────────────────────────────────────────
  logStep(4, `Verify deposit / balances (poll up to ${pollSeconds}s)`);
  const deadline = Date.now() + pollSeconds * 1000;
  let settledDepositId: string | undefined;
  let afterUsd = beforeUsd;

  while (Date.now() < deadline) {
    const deposits = await listDeposits(10);
    const hit = deposits.find((d) => {
      const st = d.status.toLowerCase();
      const ok = st === "complete" || st === "completed" || st === "pending";
      if (!ok) return false;
      return Number(d.amount?.amount ?? 0) >= Number(amount) * 0.99;
    });
    const bal = await getBusinessBalances();
    afterUsd = bal.available.find((a) => a.currency === "USD")?.amount ?? "0";
    console.log(
      `  … deposits=${deposits.length} usd=${afterUsd}` +
        (hit ? ` hit=${hit.id}/${hit.status}` : "")
    );
    if (hit && (hit.status.toLowerCase() === "complete" || hit.status.toLowerCase() === "completed")) {
      settledDepositId = hit.id;
      break;
    }
    if (Number(afterUsd) > Number(beforeUsd) + Number(amount) * 0.5) {
      settledDepositId = hit?.id;
      break;
    }
    await new Promise((r) => setTimeout(r, 5000));
  }

  const balGain = Number(afterUsd) - Number(beforeUsd);
  console.log("USD after:", afterUsd, `(Δ ${balGain.toFixed(2)})`);
  console.log("Settled deposit id:", settledDepositId ?? "(not seen — mock may still be batching, up to ~15 min)");
  if (balGain < Number(amount) * 0.5 && !settledDepositId) {
    console.warn(
      "⚠ Balance not increased yet. Circle docs: mock wires can take up to 15 minutes. Re-run with --bank-id=" +
        bankId
    );
  }

  // ── 5. Offramp payout ────────────────────────────────────────────
  let offramp: StepResult = { ok: false, detail: "skipped" };
  if (!skipOfframp) {
    logStep(5, "Offramp: payout to same bank id");
    const payoutAmount = Math.min(Number(amount), Number(afterUsd) || Number(amount));
    if (payoutAmount <= 0) {
      offramp = { ok: false, detail: "no USD available to payout" };
      console.warn("Skipping payout — Mint USD balance is 0");
    } else {
      try {
        const payout = await createBusinessBankPayout({
          amount: payoutAmount.toFixed(2),
          currency: "USD",
          destinationBankId: bankId,
          idempotencyKey: randomUUID(),
        });
        console.log("Payout id:", payout.id, "status:", payout.status);
        // brief poll
        for (let i = 0; i < 5; i++) {
          const p = await getBusinessBankPayout(payout.id);
          console.log(`  poll status=${p.status}`);
          if (["complete", "completed", "failed", "returned", "denied"].includes(p.status.toLowerCase())) {
            offramp = {
              ok: ["complete", "completed"].includes(p.status.toLowerCase()) || p.status.toLowerCase() === "pending",
              detail: `id=${p.id} status=${p.status}`,
            };
            break;
          }
          await new Promise((r) => setTimeout(r, 2000));
        }
        if (!offramp.detail || offramp.detail === "skipped") {
          offramp = { ok: true, detail: `id=${payout.id} status=${payout.status}` };
        }
        const bal2 = await getBusinessBalances();
        console.log("Balances after payout:", JSON.stringify(bal2.available));
      } catch (err) {
        offramp = { ok: false, detail: err instanceof Error ? err.message : String(err) };
        console.error("Payout FAILED:", offramp.detail);
      }
    }
  } else {
    logStep(5, "Offramp skipped (--skip-offramp)");
  }

  // ── 6. Optional onchain (Path B shape) ────────────────────────────
  let onchain: StepResult = { ok: false, detail: "skipped" };
  if (doOnchain) {
    logStep(6, "Onchain mint to facilitator (Path B shape)");
    try {
      const { getFacilitatorEoaAddress } = await import("../circle/src/wallet-adapters");
      const facilitator = getFacilitatorEoaAddress();
      console.log("Facilitator EOA:", facilitator);

      let addressId: string;
      try {
        const recip = await createRecipientAddress({
          address: facilitator,
          chain: "ARC",
          currency: "USD",
          description: "Arcittance bank.md probe",
        });
        addressId = recip.id;
        console.log("Recipient address id:", addressId, "status:", recip.status);
      } catch (err) {
        onchain = {
          ok: false,
          detail:
            (err instanceof Error ? err.message : String(err)) +
            " — allowlist facilitator in Mint Console if needed",
        };
        console.error("createRecipientAddress FAILED:", onchain.detail);
        printSummary({ bankCreate, deposit, offramp, onchain });
        process.exit(6);
      }

      const transferAmt = Math.min(Number(amount), 5).toFixed(2);
      const transfer = await mintToOnchainWallet({
        amount: transferAmt,
        currency: "USD",
        addressId,
      });
      console.log("Transfer id:", transfer.id, "status:", transfer.status);

      let settled = transfer;
      for (let i = 0; i < 20; i++) {
        settled = await getBusinessTransfer(transfer.id);
        console.log(`  transfer poll status=${settled.status} tx=${settled.transactionHash ?? "-"}`);
        if (["complete", "completed", "failed", "denied"].includes(settled.status.toLowerCase())) break;
        await new Promise((r) => setTimeout(r, 2000));
      }
      const ok = ["complete", "completed"].includes(settled.status.toLowerCase());
      onchain = {
        ok,
        detail: `id=${settled.id} status=${settled.status} tx=${settled.transactionHash ?? "n/a"}`,
      };
    } catch (err) {
      onchain = { ok: false, detail: err instanceof Error ? err.message : String(err) };
      console.error("Onchain mint FAILED:", onchain.detail);
    }
  } else {
    logStep(6, "Onchain skipped (pass --onchain to mint to facilitator)");
  }

  printSummary({ bankCreate, deposit, offramp, onchain });
  console.log("\nBank id to reuse in Path A fiat / Path B:");
  console.log(`  ${bankId}`);
  console.log("\nRe-run examples:");
  console.log(`  npm run test:mint-bank-rail -- --bank-id=${bankId} --skip-offramp`);
  console.log(`  npm run test:mint-bank-rail -- --bank-id=${bankId} --onchain --skip-offramp`);

  if (!bankCreate.ok || !deposit.ok) process.exit(1);
  if (!skipOfframp && !offramp.ok) process.exit(5);
  if (doOnchain && !onchain.ok) process.exit(6);
}

function printSummary(s: {
  bankCreate: StepResult;
  deposit: StepResult;
  offramp: StepResult;
  onchain: StepResult;
}): void {
  console.log("\n=== Summary (map to Path B) ===");
  console.log(`  1 link bank:     ${s.bankCreate.ok ? "OK" : "FAIL"}  ${s.bankCreate.detail ?? ""}`);
  console.log(`  3 mock deposit:  ${s.deposit.ok ? "OK" : "FAIL"}  ${s.deposit.detail ?? ""}`);
  console.log(`  5 offramp:       ${s.offramp.ok ? "OK" : "FAIL/skip"}  ${s.offramp.detail ?? ""}`);
  console.log(`  6 onchain mint:  ${s.onchain.ok ? "OK" : "FAIL/skip"}  ${s.onchain.detail ?? ""}`);
  console.log(
    "\nPath B today = steps 1→3→4 then 6 (ledger + mintToOnchainWallet).\n" +
      "Path A fiat  = needs step-1 bank id, then step 5 payout."
  );
}

main().catch((e) => {
  console.error("FATAL:", e.message ?? e);
  process.exit(1);
});
