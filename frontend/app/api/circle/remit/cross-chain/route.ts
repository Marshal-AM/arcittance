import { NextResponse } from "next/server";
import { loadServerEnv } from "@/lib/server/env";

export async function POST(req: Request) {
  try {
    loadServerEnv();
    const body = await req.json() as {
      userToken?: string;
      walletId?: string;
      recipient?: string;
      amount?: string;
      destinationChainId?: number;
      routingMethod?: number;
      transferSpeed?: "fast" | "standard";
      phase?: "prepare" | "bridge";
    };

    if (
      !body.userToken ||
      !body.walletId ||
      !body.recipient ||
      !body.amount ||
      body.destinationChainId === undefined
    ) {
      return NextResponse.json(
        {
          error:
            "userToken, walletId, recipient, amount, and destinationChainId are required",
        },
        { status: 400 }
      );
    }

    if (body.destinationChainId === 0) {
      return NextResponse.json(
        { error: "Use /api/circle/remit/send for Arc-local transfers" },
        { status: 400 }
      );
    }

    const { screenAddress, alertReview } = await import("@/lib/circle/compliance");
    const screen = screenAddress(body.recipient);
    if (!screen.allowed) {
      alertReview(body.recipient, screen.reason ?? "blocklisted");
      return NextResponse.json({ error: screen.reason }, { status: 403 });
    }

    const params = {
      userToken:          body.userToken,
      walletId:           body.walletId,
      recipient:          body.recipient,
      amountUsdc:         body.amount,
      destinationChainId: body.destinationChainId,
      // Coerce so HTML/JSON string "1" still selects Gateway (=== 1).
      routingMethod:      Number(body.routingMethod ?? 0),
      transferSpeed:      body.transferSpeed,
    };

    const phase = body.phase ?? "prepare";

    if (phase === "prepare") {
      const { prepareCrossChainRemittance } = await import(
        "@/lib/circle/remittance-orchestrator"
      );
      const prepared = await prepareCrossChainRemittance(params);
      return NextResponse.json({
        phase:       "prepare",
        challengeId: prepared.challengeId,
        facilitator: prepared.facilitatorAddress,
        amountMicro: prepared.amountMicro,
        sponsoredGas: true,
      });
    }

    const { completeCrossChainRemittance } = await import(
      "@/lib/circle/remittance-orchestrator"
    );
    const result = await completeCrossChainRemittance(params);

    return NextResponse.json({
      phase:         "bridge",
      success:       true,
      transactionId: result.userTransferId,
      // Prefer destination mint/spend hash over Arc debit for explorer links.
      txHash:        result.spendTxHash ?? result.burnTxHash ?? result.arcTxHash,
      burnTxHash:    result.burnTxHash,
      spendTxHash:   result.spendTxHash,
      arcTxHash:     result.arcTxHash,
      bridgeFeeUsdc: result.bridgeFeeUsdc,
      state:         result.userTransferState,
      sponsoredGas:  true,
      orchestration: result.orchestration,
      facilitator:   result.facilitatorAddress,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? String(err) }, { status: 500 });
  }
}
