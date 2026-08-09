import { NextResponse } from "next/server";
import { loadServerEnv } from "@/lib/server/env";

export async function POST(req: Request) {
  try {
    loadServerEnv();
    const body = await req.json() as {
      payee?: string;
      token?: string;
      amount?: string;
      approvers?: string[];
      approvalsRequired?: string;
      disputeDeadline?: string;
    };

    if (
      !body.payee ||
      !body.token ||
      !body.amount ||
      !body.approvers?.length ||
      !body.approvalsRequired ||
      !body.disputeDeadline
    ) {
      return NextResponse.json(
        {
          error:
            "payee, token, amount, approvers, approvalsRequired, and disputeDeadline are required",
        },
        { status: 400 }
      );
    }

    const walletId = process.env.CIRCLE_FACILITATOR_WALLET_ID;
    if (!walletId) {
      return NextResponse.json(
        { error: "CIRCLE_FACILITATOR_WALLET_ID not configured" },
        { status: 500 }
      );
    }

    const { createMilestoneViaCircle } = await import("@/lib/circle/developer-client");
    const { getContractAddresses } = await import("@/lib/contracts/addresses");

    const escrow = getContractAddresses().ConditionalEscrow;
    const result = await createMilestoneViaCircle(walletId, escrow, {
      payee:             body.payee,
      token:             body.token,
      amount:            body.amount,
      approvers:         body.approvers,
      approvalsRequired: body.approvalsRequired,
      disputeDeadline:   body.disputeDeadline,
    });

    for (const step of ["approve", "create"] as const) {
      const tx = result[step];
      if (["FAILED", "CANCELLED", "DENIED", "STUCK"].includes(tx.state)) {
        return NextResponse.json(
          {
            error:         `Circle ${step} transaction ${tx.state}`,
            transactionId: tx.transactionId,
            state:         tx.state,
          },
          { status: 502 }
        );
      }
    }

    return NextResponse.json({
      success:       true,
      approveTxId:   result.approve.transactionId,
      createTxId:    result.create.transactionId,
      txHash:        result.create.txHash,
      state:         result.create.state,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? String(err) }, { status: 500 });
  }
}
