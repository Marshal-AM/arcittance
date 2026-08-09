import { NextResponse } from "next/server";
import { loadServerEnv } from "@/lib/server/env";
import { CHAIN_ID } from "@/lib/contracts/addresses";

/** POST /api/milestones/metadata — save off-chain title/description for a milestone id. */
export async function POST(req: Request) {
  try {
    loadServerEnv();
    const body = (await req.json()) as {
      milestoneId?: string | number;
      title?: string;
      description?: string;
      creatorAddress?: string;
      txHash?: string;
      chainId?: number;
    };

    if (body.milestoneId == null || body.milestoneId === "") {
      return NextResponse.json({ error: "milestoneId required" }, { status: 400 });
    }
    if (!body.title?.trim()) {
      return NextResponse.json({ error: "title required" }, { status: 400 });
    }

    const { upsertMilestoneMetadata } = await import("@/lib/db");
    const row = await upsertMilestoneMetadata({
      milestone_id: body.milestoneId,
      title: body.title,
      description: body.description ?? "",
      creator_address: body.creatorAddress,
      tx_hash: body.txHash,
      chain_id: body.chainId ?? CHAIN_ID,
    });

    return NextResponse.json({
      milestoneId: String(row.milestone_id),
      title: row.title,
      description: row.description,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
