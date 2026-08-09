import { NextResponse } from "next/server";
import { loadServerEnv } from "@/lib/server/env";
import { CHAIN_ID } from "@/lib/contracts/addresses";

/** POST /api/subscriptions/plan-metadata — save off-chain title/description for a plan id. */
export async function POST(req: Request) {
  try {
    loadServerEnv();
    const body = (await req.json()) as {
      planId?: string | number;
      title?: string;
      description?: string;
      creatorAddress?: string;
      txHash?: string;
      chainId?: number;
    };

    if (body.planId == null || body.planId === "") {
      return NextResponse.json({ error: "planId required" }, { status: 400 });
    }
    if (!body.title?.trim()) {
      return NextResponse.json({ error: "title required" }, { status: 400 });
    }

    const { upsertSubscriptionPlanMetadata } = await import("@/lib/db");
    const row = await upsertSubscriptionPlanMetadata({
      plan_id: body.planId,
      title: body.title,
      description: body.description ?? "",
      creator_address: body.creatorAddress,
      tx_hash: body.txHash,
      chain_id: body.chainId ?? CHAIN_ID,
    });

    return NextResponse.json({
      planId: String(row.plan_id),
      title: row.title,
      description: row.description,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
