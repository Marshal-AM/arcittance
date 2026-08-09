import { NextResponse } from "next/server";
import { loadServerEnv } from "@/lib/server/env";
import { getDestinationChain } from "@/lib/contracts/addresses";
import { buildFeeBreakdown } from "@/lib/fees";

export async function POST(req: Request) {
  try {
    loadServerEnv();
    const body = await req.json() as {
      amount?: string;
      destinationChainId?: number;
      transferSpeed?: "fast" | "standard";
      routingMethod?: number;
    };

    if (!body.amount) {
      return NextResponse.json({ error: "amount is required" }, { status: 400 });
    }

    const destinationChainId = body.destinationChainId ?? 0;
    const transferSpeed = body.transferSpeed ?? "fast";
    const amountBase = BigInt(Math.round(Number(body.amount) * 1_000_000));

    let bridgeFeeUsdc = 0.05;
    if (destinationChainId > 0) {
      try {
        const dest = getDestinationChain(destinationChainId);
        const { estimateCctpFee } = await import("@/lib/circle/cctp-client");
        const estimate = await estimateCctpFee({
          fromChain:        "Arc_Testnet",
          toChain:          dest?.bridgeKitName ?? "Base_Sepolia",
          amount:           body.amount,
          recipientAddress: "0x80568CF6687392bD74f15b1C600029499D97Ff40",
          speed:            transferSpeed,
        });
        const feeAmount = (estimate as { fee?: string }).fee;
        if (feeAmount) bridgeFeeUsdc = parseFloat(feeAmount);
      } catch {
        // static fallback
      }
    }

    const routingUi = destinationChainId === 0 ? "arc-local" : "cctp";

    const breakdown = buildFeeBreakdown({
      amountBaseUnits: amountBase,
      routingMethod:   routingUi,
      transferSpeed,
      bridgeFeeUsdc,
    });

    return NextResponse.json(
      {
        bridgeFeeUsdc,
        breakdown,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? String(err) }, { status: 500 });
  }
}
