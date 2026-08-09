import { NextResponse } from "next/server";
import { loadServerEnv } from "@/lib/server/env";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    loadServerEnv();
    const { id } = await ctx.params;
    const { getPayoutById, updatePayoutRow } = await import("@/lib/db");
    const { getPayoutStatus } = await import("@/lib/circle/payouts-client");

    const row = await getPayoutById(id);
    if (!row) {
      return NextResponse.json({ error: "Payout not found" }, { status: 404 });
    }

    const live = await getPayoutStatus(row.payout_id);
    const updated = await updatePayoutRow(row.id, {
      status: live.status,
      tx_hash: live.transactionHash ?? row.tx_hash ?? undefined,
      metadata: { ...(row.metadata ?? {}), live: live.raw },
    });

    const failed = ["failed", "denied", "cancelled"].includes(live.status.toLowerCase());
    const complete = ["complete", "completed"].includes(live.status.toLowerCase());

    return NextResponse.json({
      id: updated.id,
      payoutId: updated.payout_id,
      status: updated.status,
      txHash: updated.tx_hash,
      failed,
      complete,
      canRetry: failed,
      errorCode: live.errorCode ?? null,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? String(err) }, { status: 500 });
  }
}
