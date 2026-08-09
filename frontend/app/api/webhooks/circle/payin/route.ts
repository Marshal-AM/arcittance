import { NextResponse } from "next/server";
import { loadServerEnv } from "@/lib/server/env";

/**
 * Circle payin webhook — updates payins when payment settles.
 * Locally, use GET /api/remit/payins/:id polling instead.
 */
export async function POST(req: Request) {
  try {
    loadServerEnv();
    const payload = await req.json() as {
      type?: string;
      paymentIntentId?: string;
      payment?: { paymentIntentId?: string; status?: string };
      data?: { id?: string; paymentIntentId?: string; status?: string };
    };

    const intentId =
      payload.paymentIntentId ??
      payload.payment?.paymentIntentId ??
      payload.data?.paymentIntentId ??
      payload.data?.id;

    if (!intentId) {
      return NextResponse.json({ error: "paymentIntentId missing" }, { status: 400 });
    }

    const { getPayinByIntentId, updatePayin } = await import("@/lib/db");
    const { getPaymentIntent, isPayinSettled } = await import(
      "@/lib/circle/payins-client"
    );

    const row = await getPayinByIntentId(intentId);
    if (!row) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const intent = await getPaymentIntent(intentId);
    const settled = isPayinSettled(intent);
    await updatePayin(row.id, {
      status: settled ? "complete" : (intent.status as any),
      deposit_address: intent.depositAddress ?? row.deposit_address ?? undefined,
      received_at: settled ? new Date().toISOString() : undefined,
      metadata: { ...(row.metadata ?? {}), webhook: payload, timeline: intent.timeline },
    });

    return NextResponse.json({ ok: true, settled });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? String(err) }, { status: 500 });
  }
}
