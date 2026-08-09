import { NextResponse } from "next/server";
import { loadServerEnv } from "@/lib/server/env";

/**
 * Path A prep — create Circle challenge to move USDC from embedded wallet → facilitator EOA
 * so StableFX can settle (EOA signs Permit2). After FX, EURC is sent back to the user.
 */
export async function POST(req: Request) {
  try {
    loadServerEnv();
    const body = (await req.json()) as {
      userToken?: string;
      walletId?: string;
      amount?: string;
      currency?: "USDC" | "EURC";
    };

    if (!body.userToken || !body.walletId || !body.amount) {
      return NextResponse.json(
        { error: "userToken, walletId, and amount are required" },
        { status: 400 }
      );
    }
    if (body.currency && body.currency !== "USDC") {
      return NextResponse.json(
        { error: "Path A debit currently supports USDC only (StableFX from-side)" },
        { status: 400 }
      );
    }

    const { getFacilitatorEoaAddress } = await import("@/lib/circle/wallet-adapters");
    const facilitatorAddress = getFacilitatorEoaAddress();

    const { createUserTransferChallenge } = await import(
      "../../../../../../circle/src/user-client"
    );
    const { challengeId } = await createUserTransferChallenge({
      userToken: body.userToken,
      walletId: body.walletId,
      destinationAddress: facilitatorAddress,
      amountUsdc: body.amount,
    });

    return NextResponse.json({
      challengeId,
      facilitatorAddress,
      amount: body.amount,
      currency: "USDC",
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
