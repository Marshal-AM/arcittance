import { NextResponse } from "next/server";
import { loadServerEnv } from "@/lib/server/env";
import { getFacilitatorEoaAddress } from "@/lib/circle/wallet-adapters";

/**
 * Path B — create sandbox bank, simulate wire, mint onchain to facilitator, ledger credit.
 * Body: { userId, amount, step?: "start" | "status", ledgerId? }
 */
export async function POST(req: Request) {
  try {
    loadServerEnv();
    const body = await req.json() as {
      userId?: string;
      amount?: string;
      step?: "start" | "mint" | "status";
      ledgerId?: string;
    };

    if (!body.userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    const {
      createMintLedgerEntry,
      updateMintLedger,
      getMintLedgerById,
      getAvailableLedgerBalanceUsdc,
    } = await import("@/lib/db");

    if (body.step === "status" && body.ledgerId) {
      const row = await getMintLedgerById(body.ledgerId);
      const available = await getAvailableLedgerBalanceUsdc(body.userId);
      return NextResponse.json({ ledger: row, availableLedgerUsdc: available });
    }

    if (!body.amount || Number(body.amount) <= 0) {
      return NextResponse.json({ error: "amount required" }, { status: 400 });
    }

    const {
      createSandboxBankAccount,
      getWireInstructions,
      simulateWireDeposit,
      pollDepositStatus,
      createRecipientAddress,
      mintToOnchainWallet,
      getBusinessTransfer,
    } = await import("@/lib/circle/ramp-mint");

    const ledger = await createMintLedgerEntry({
      sender_user_id: body.userId,
      amount: body.amount,
      currency: "USD",
      status: "pending",
    });

    const bank = await createSandboxBankAccount({
      description: `Arcittance Path B ${body.userId.slice(0, 8)}`,
    });
    await updateMintLedger(ledger.id, {
      bank_account_id: bank.id,
      metadata: { bank },
    });

    const instructions = await getWireInstructions(bank.id);
    const trackingRef = instructions.trackingRef ?? bank.trackingRef;
    const van = instructions.beneficiaryAccountNumber;
    if (!trackingRef || !van) {
      await updateMintLedger(ledger.id, { status: "failed" });
      return NextResponse.json(
        { error: "Wire instructions missing trackingRef or VAN", ledgerId: ledger.id },
        { status: 500 }
      );
    }

    await simulateWireDeposit({
      amount: body.amount,
      trackingRef,
      beneficiaryAccountNumber: van,
    });

    const deposit = await pollDepositStatus({
      timeoutMs: 45_000,
      minAmount: body.amount,
    });

    await updateMintLedger(ledger.id, {
      status: deposit ? "deposited" : "pending",
      deposit_id: deposit?.id,
      metadata: { bank, deposit, instructions },
    });

    // Mint onchain to facilitator
    const facilitator = getFacilitatorEoaAddress();
    let recipient;
    try {
      recipient = await createRecipientAddress({
        address: facilitator,
        chain: "ARC",
        currency: "USD",
        description: "Arcittance facilitator Path B",
      });
    } catch (err: any) {
      // Address may already exist / pending approval — surface clearly
      await updateMintLedger(ledger.id, {
        status: "deposited",
        metadata: {
          bank,
          deposit,
          mintError: err.message ?? String(err),
          note: "Recipient address may need Mint Console approval before transfer",
        },
      });
      return NextResponse.json({
        ledgerId: ledger.id,
        status: "deposited",
        bankAccountId: bank.id,
        depositId: deposit?.id ?? null,
        warning: err.message ?? String(err),
        message:
          "Wire deposited. Allowlist facilitator in Mint Console, then POST step=mint with ledgerId.",
        facilitatorAddress: facilitator,
      });
    }

    const transfer = await mintToOnchainWallet({
      amount: body.amount,
      currency: "USD",
      addressId: recipient.id,
    });

    let settled = transfer;
    for (let i = 0; i < 15; i++) {
      settled = await getBusinessTransfer(transfer.id);
      if (["complete", "completed"].includes(settled.status.toLowerCase())) break;
      if (["failed", "denied"].includes(settled.status.toLowerCase())) break;
      await new Promise((r) => setTimeout(r, 2000));
    }

    const minted = ["complete", "completed"].includes(settled.status.toLowerCase());
    await updateMintLedger(ledger.id, {
      status: minted ? "minted" : settled.status.toLowerCase() === "failed" ? "failed" : "deposited",
      transfer_id: settled.id,
      recipient_address_id: recipient.id,
      mint_tx_hash: settled.transactionHash,
      metadata: { bank, deposit, recipient, transfer: settled },
    });

    const available = await getAvailableLedgerBalanceUsdc(body.userId);

    return NextResponse.json({
      ledgerId: ledger.id,
      status: minted ? "minted" : settled.status,
      bankAccountId: bank.id,
      depositId: deposit?.id ?? null,
      transferId: settled.id,
      mintTxHash: settled.transactionHash ?? null,
      facilitatorAddress: facilitator,
      availableLedgerUsdc: available,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? String(err) }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    loadServerEnv();
    const userId = new URL(req.url).searchParams.get("userId");
    if (!userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }
    const { getAvailableLedgerBalanceUsdc, listMintLedgerForUser } = await import("@/lib/db");
    const available = await getAvailableLedgerBalanceUsdc(userId);
    const entries = await listMintLedgerForUser(userId, 10);
    return NextResponse.json({ availableLedgerUsdc: available, entries });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? String(err) }, { status: 500 });
  }
}
