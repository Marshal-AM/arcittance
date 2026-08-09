import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { loadServerEnv } from "@/lib/server/env";

export async function POST(req: Request) {
  try {
    loadServerEnv();
    const body = await req.json() as { vaultAddress?: string };
    if (!body.vaultAddress || !isAddress(body.vaultAddress)) {
      return NextResponse.json({ error: "vaultAddress required" }, { status: 400 });
    }

    const { runPayrollViaCircle } = await import("@/lib/circle/developer-client");
    const { orchestratePayrollCrossChain } = await import("@/lib/circle/cross-chain-orchestrator");

    const walletId = process.env.CIRCLE_FACILITATOR_WALLET_ID;
    if (!walletId) {
      return NextResponse.json(
        { error: "CIRCLE_FACILITATOR_WALLET_ID not configured" },
        { status: 500 }
      );
    }

    const vault = body.vaultAddress as `0x${string}`;
    const result = await runPayrollViaCircle(walletId, vault);

    let orchestration = null;
    if (result.txHash) {
      try {
        orchestration = await orchestratePayrollCrossChain({
          vaultAddress:  vault,
          payrollTxHash: result.txHash,
        });
      } catch (orchErr: any) {
        orchestration = { error: orchErr.message ?? String(orchErr) };
      }
    }

    return NextResponse.json({
      success:       true,
      transactionId: result.transactionId,
      state:         result.state,
      txHash:        result.txHash,
      orchestration,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? String(err) }, { status: 500 });
  }
}
