import { NextResponse } from "next/server";
import { loadServerEnv } from "@/lib/server/env";

/** Create a Circle payment intent (fund remit with USDC on Arc). */
export async function POST(req: Request) {
  try {
    loadServerEnv();
    const body = await req.json() as {
      amount?: string;
      userId?: string;
      email?: string;
      chain?: string;
    };

    if (!body.amount || Number(body.amount) <= 0) {
      return NextResponse.json({ error: "amount is required" }, { status: 400 });
    }
    if (Number(body.amount) < 1) {
      return NextResponse.json({ error: "Minimum fund amount is 1 USDC" }, { status: 400 });
    }

    const {
      createPaymentIntent,
      waitForDepositAddress,
    } = await import("@/lib/circle/payins-client");
    const { createPayin, upsertCustodyWallet } = await import("@/lib/db");
    const { ensureCustodyWalletForUser } = await import(
      "@/lib/circle/custody-client"
    );

    if (body.userId) {
      const mapped = await ensureCustodyWalletForUser(body.userId);
      await upsertCustodyWallet({
        user_id: body.userId,
        sub_wallet_id: mapped.subWalletId,
      }).catch(() => undefined);
    }

    const intent = await createPaymentIntent({
      amount: Number(body.amount).toFixed(2),
      currency: "USD",
      chain: body.chain ?? "ARC",
      type: "transient",
    });

    let withAddress = intent;
    if (!intent.depositAddress) {
      withAddress = await waitForDepositAddress(intent.id, { timeoutMs: 45_000 });
    }

    const row = await createPayin({
      payment_intent_id: withAddress.id,
      amount: body.amount,
      currency: "USD",
      status: withAddress.status === "unknown" ? "created" : withAddress.status,
      sender_email: body.email,
      sender_user_id: body.userId,
      deposit_address: withAddress.depositAddress,
      chain: withAddress.chain ?? "ARC",
      merchant_wallet_id: withAddress.merchantWalletId,
      metadata: { timeline: withAddress.timeline },
    });

    return NextResponse.json(
      {
        id: row.id,
        paymentIntentId: withAddress.id,
        amount: body.amount,
        currency: "USDC",
        status: row.status,
        depositAddress: withAddress.depositAddress ?? null,
        chain: withAddress.chain ?? "ARC",
        merchantWalletId: withAddress.merchantWalletId,
        message: withAddress.depositAddress
          ? "Send USDC on Arc to this deposit address"
          : "Payment intent created — deposit address pending (poll GET /api/remit/payins/:id)",
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? String(err) }, { status: 500 });
  }
}
