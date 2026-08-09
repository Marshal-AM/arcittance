import { NextResponse } from "next/server";
import { loadServerEnv } from "@/lib/server/env";

/** Wait until Path A debit (user → facilitator, USDC or EURC) is COMPLETE. */
export async function POST(req: Request) {
  try {
    loadServerEnv();
    const body = (await req.json()) as {
      walletId?: string;
      facilitatorAddress?: string;
      amount?: string;
    };
    if (!body.walletId || !body.facilitatorAddress || !body.amount) {
      return NextResponse.json(
        { error: "walletId, facilitatorAddress, and amount are required" },
        { status: 400 }
      );
    }

    const { waitForOutboundTransfer } = await import(
      "../../../../../../circle/src/user-client"
    );
    const amountMicro = String(Math.round(Number(body.amount) * 1_000_000));
    const result = await waitForOutboundTransfer({
      walletId: body.walletId,
      destinationAddress: body.facilitatorAddress,
      amountMicro,
    });

    return NextResponse.json({
      transactionId: result.transactionId,
      state: result.state,
      txHash: result.txHash,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
