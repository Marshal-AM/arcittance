import { NextResponse } from "next/server";
import { loadServerEnv } from "@/lib/server/env";

export async function POST(req: Request) {
  try {
    loadServerEnv();
    const body = await req.json() as { subscriptionId?: string };
    if (!body.subscriptionId) {
      return NextResponse.json({ error: "subscriptionId required" }, { status: 400 });
    }

    const { chargeSubscriptionViaCircle } = await import("@/lib/circle/developer-client");
    const { getContractAddresses } = await import("@/lib/contracts/addresses");

    const walletId = process.env.CIRCLE_FACILITATOR_WALLET_ID;
    if (!walletId) {
      return NextResponse.json(
        { error: "CIRCLE_FACILITATOR_WALLET_ID not configured" },
        { status: 500 }
      );
    }

    const subManager = getContractAddresses().SubscriptionManager;
    const result = await chargeSubscriptionViaCircle(
      walletId,
      subManager,
      BigInt(body.subscriptionId)
    );

    return NextResponse.json({
      success:       true,
      transactionId: result.transactionId,
      state:         result.state,
      txHash:        result.txHash,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? String(err) }, { status: 500 });
  }
}
