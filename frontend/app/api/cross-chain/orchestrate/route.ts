import { NextResponse } from "next/server";
import { loadServerEnv } from "@/lib/server/env";

export async function POST(req: Request) {
  try {
    loadServerEnv();
    const body = await req.json() as {
      payrollTxHash?: string;
      vaultAddress?: string;
      routerAddress?: string;
    };

    if (!body.payrollTxHash) {
      return NextResponse.json({ error: "payrollTxHash is required" }, { status: 400 });
    }
    if (!body.vaultAddress || !/^0x[a-fA-F0-9]{40}$/.test(body.vaultAddress)) {
      return NextResponse.json({ error: "vaultAddress is required" }, { status: 400 });
    }

    const { orchestratePayrollCrossChain } = await import("@/lib/circle/cross-chain-orchestrator");

    const result = await orchestratePayrollCrossChain({
      vaultAddress:  body.vaultAddress as `0x${string}`,
      payrollTxHash: body.payrollTxHash,
      routerAddress: body.routerAddress,
    });

    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? String(err) }, { status: 500 });
  }
}
