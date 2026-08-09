import { NextResponse } from "next/server";
import { loadServerEnv } from "@/lib/server/env";

/**
 * Path A same-chain send (Arc).
 * prepare → challengeId (Web SDK) → complete → wait for transfer.
 * Supports USDC and EURC.
 */
export async function POST(req: Request) {
  try {
    loadServerEnv();
    const body = (await req.json()) as {
      userToken?: string;
      walletId?: string;
      recipient?: string;
      amount?: string;
      currency?: "USDC" | "EURC";
      phase?: "prepare" | "complete";
    };

    if (!body.userToken || !body.walletId || !body.recipient || !body.amount) {
      return NextResponse.json(
        { error: "userToken, walletId, recipient, and amount are required" },
        { status: 400 }
      );
    }

    const currency = body.currency ?? "USDC";
    const phase = body.phase ?? "prepare";

    const { screenAddress, alertReview } = await import("@/lib/circle/compliance");
    const screen = screenAddress(body.recipient);
    if (!screen.allowed) {
      alertReview(body.recipient, screen.reason ?? "blocklisted");
      return NextResponse.json({ error: screen.reason }, { status: 403 });
    }

    const {
      createUserTransferChallenge,
      waitForOutboundTransfer,
    } = await import("@/lib/circle/user-client");

    if (phase === "prepare") {
      const { challengeId } = await createUserTransferChallenge({
        userToken: body.userToken,
        walletId: body.walletId,
        destinationAddress: body.recipient,
        amountUsdc: body.amount,
        currency,
      });
      return NextResponse.json({
        phase: "prepare",
        challengeId,
        currency,
        sponsoredGas: true,
      });
    }

    const amountMicro = String(Math.round(Number(body.amount) * 1_000_000));
    const result = await waitForOutboundTransfer({
      walletId: body.walletId,
      destinationAddress: body.recipient,
      amountMicro,
    });

    return NextResponse.json({
      phase: "complete",
      success: true,
      transactionId: result.transactionId,
      state: result.state,
      txHash: result.txHash,
      currency,
      sponsoredGas: true,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? String(err) }, { status: 500 });
  }
}
