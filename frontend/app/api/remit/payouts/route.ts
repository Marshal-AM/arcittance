import { NextResponse } from "next/server";
import { loadServerEnv } from "@/lib/server/env";
import { randomUUID } from "crypto";
import type { PayoutCurrency } from "@/lib/circle/supported-chains";

export async function POST(req: Request) {
  try {
    loadServerEnv();
    const body = await req.json() as {
      recipientId?: string;
      amount?: string;
      currency?: PayoutCurrency;
      chain?: string;
      remittanceId?: string;
      retry?: boolean;
    };

    if (!body.recipientId || !body.amount) {
      return NextResponse.json({ error: "recipientId and amount required" }, { status: 400 });
    }

    const currency = body.currency ?? "EURC";
    const idempotencyKey = randomUUID();

    const { createPayout } = await import("@/lib/circle/payouts-client");
    const { getPrimaryCustodyWallet } = await import("@/lib/circle/custody-client");

    const wallet = await getPrimaryCustodyWallet();
    const payout = await createPayout({
      recipientId: body.recipientId,
      amount: Number(body.amount).toFixed(2),
      currency,
      sourceWalletId: wallet.walletId,
      idempotencyKey,
      purposeOfTransfer: "PMT001",
    });

    const { createPayoutRow } = await import("@/lib/db");
    const row = await createPayoutRow({
      payout_id: payout.id,
      recipient_id: body.recipientId,
      amount: body.amount,
      currency,
      status: payout.status,
      remittance_id: body.remittanceId,
      chain: body.chain,
      tx_hash: payout.transactionHash,
      idempotency_key: idempotencyKey,
      metadata: { retry: body.retry === true },
    });

    return NextResponse.json({
      id: row.id,
      payoutId: payout.id,
      status: payout.status,
      amount: body.amount,
      currency,
      txHash: payout.transactionHash ?? null,
      idempotencyKey,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? String(err) }, { status: 500 });
  }
}
