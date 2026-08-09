import { NextResponse } from "next/server";
import { loadServerEnv } from "@/lib/server/env";

export async function POST(req: Request) {
  try {
    loadServerEnv();
    const body = await req.json() as { milestoneId?: string };
    if (!body.milestoneId) {
      return NextResponse.json({ error: "milestoneId required" }, { status: 400 });
    }

    const { approveMilestoneViaCircle } = await import("@/lib/circle/developer-client");
    const { getContractAddresses } = await import("@/lib/contracts/addresses");

    const walletId = process.env.CIRCLE_FACILITATOR_WALLET_ID;
    if (!walletId) {
      return NextResponse.json(
        { error: "CIRCLE_FACILITATOR_WALLET_ID not configured" },
        { status: 500 }
      );
    }

    const escrow = getContractAddresses().ConditionalEscrow;
    const result = await approveMilestoneViaCircle(
      walletId,
      escrow,
      BigInt(body.milestoneId)
    );

    if (["FAILED", "CANCELLED", "DENIED", "STUCK"].includes(result.state)) {
      return NextResponse.json(
        { error: `Circle transaction ${result.state}`, transactionId: result.transactionId, state: result.state },
        { status: 502 }
      );
    }

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
