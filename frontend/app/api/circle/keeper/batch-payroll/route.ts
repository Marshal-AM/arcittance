import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { loadServerEnv } from "@/lib/server/env";

/**
 * Batch marketplace payout — runs keeper payroll + cross-chain orchestration.
 * Employees must already be registered (vault owner registers via wagmi in UI).
 */
export async function POST(req: Request) {
  try {
    loadServerEnv();
    const body = await req.json() as { vaultAddress?: string };
    if (!body.vaultAddress || !isAddress(body.vaultAddress)) {
      return NextResponse.json({ error: "vaultAddress required" }, { status: 400 });
    }

    const walletId = process.env.CIRCLE_FACILITATOR_WALLET_ID;
    if (!walletId) {
      return NextResponse.json(
        { error: "CIRCLE_FACILITATOR_WALLET_ID not configured" },
        { status: 500 }
      );
    }

    const { runPayrollViaCircle } = await import("@/lib/circle/developer-client");
    const { orchestratePayrollCrossChain } = await import(
      "@/lib/circle/cross-chain-orchestrator"
    );

    const vault = body.vaultAddress as `0x${string}`;
    const payroll = await runPayrollViaCircle(walletId, vault);

    let orchestration = null;
    if (payroll.txHash) {
      try {
        orchestration = await orchestratePayrollCrossChain({
          vaultAddress:  vault,
          payrollTxHash: payroll.txHash,
        });
      } catch (orchErr: any) {
        orchestration = { error: orchErr.message ?? String(orchErr) };
      }
    }

    return NextResponse.json({
      success:       true,
      transactionId: payroll.transactionId,
      state:         payroll.state,
      txHash:        payroll.txHash,
      orchestration,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? String(err) }, { status: 500 });
  }
}
