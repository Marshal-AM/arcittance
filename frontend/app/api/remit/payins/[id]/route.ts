import { NextResponse } from "next/server";
import { loadServerEnv } from "@/lib/server/env";

/** Poll payin / payment intent status (local-dev webhook fallback). */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    loadServerEnv();
    const { id } = await ctx.params;
    const { getPayinById, updatePayin } = await import("@/lib/db");
    const {
      getPaymentIntent,
      isPayinSettled,
      waitForDepositAddress,
    } = await import("@/lib/circle/payins-client");

    const row = await getPayinById(id);
    if (!row) {
      return NextResponse.json({ error: "Payin not found" }, { status: 404 });
    }

    let intent = await getPaymentIntent(row.payment_intent_id);
    if (!intent.depositAddress) {
      intent = await waitForDepositAddress(row.payment_intent_id, { timeoutMs: 8_000 });
    }

    const settled = isPayinSettled(intent);
    const status = settled
      ? "complete"
      : intent.status === "unknown"
        ? row.status
        : intent.status;

    const patch: Parameters<typeof updatePayin>[1] = {
      status: status as any,
      metadata: { ...(row.metadata ?? {}), timeline: intent.timeline, amountPaid: intent.amountPaid },
    };
    if (intent.depositAddress) patch.deposit_address = intent.depositAddress;
    if (settled && !row.received_at) patch.received_at = new Date().toISOString();

    const updated = await updatePayin(row.id, patch);

    return NextResponse.json(
      {
        id: updated.id,
        paymentIntentId: updated.payment_intent_id,
        status: updated.status,
        depositAddress: updated.deposit_address,
        chain: updated.chain,
        amount: updated.amount,
        amountPaid: intent.amountPaid,
        receivedAt: updated.received_at,
        settled,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? String(err) }, { status: 500 });
  }
}
