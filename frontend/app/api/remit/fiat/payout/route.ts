import { NextResponse } from "next/server";
import { loadServerEnv } from "@/lib/server/env";

/** Fiat delivery — Mint businessAccount bank payout. */
export async function POST(req: Request) {
  try {
    loadServerEnv();
    const body = await req.json() as {
      amount?: string;
      currency?: string;
      destinationBankId?: string;
      remittanceId?: string;
    };

    if (!body.amount || !body.destinationBankId) {
      return NextResponse.json(
        { error: "amount and destinationBankId required" },
        { status: 400 }
      );
    }

    const { createBusinessBankPayout } = await import("@/lib/circle/ramp-mint");
    const payout = await createBusinessBankPayout({
      amount: body.amount,
      currency: body.currency ?? "USD",
      destinationBankId: body.destinationBankId,
    });

    return NextResponse.json({
      payoutId: payout.id,
      status: payout.status,
      remittanceId: body.remittanceId ?? null,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? String(err) }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    loadServerEnv();
    const id = new URL(req.url).searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const { getBusinessBankPayout } = await import("@/lib/circle/ramp-mint");
    const payout = await getBusinessBankPayout(id);
    const failed = ["failed", "returned", "denied"].includes(payout.status.toLowerCase());
    const complete = ["complete", "completed"].includes(payout.status.toLowerCase());
    return NextResponse.json({
      payoutId: payout.id,
      status: payout.status,
      failed,
      complete,
      canRetry: failed,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? String(err) }, { status: 500 });
  }
}
