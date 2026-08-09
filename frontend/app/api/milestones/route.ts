// frontend/app/api/milestones/route.ts
/**
 * GET /api/milestones
 * Returns all milestones from ConditionalEscrow using getMilestone(id) view calls.
 * Reads each milestone by index (0..count-1) — avoids eth_getLogs block-range limits.
 */

import { NextResponse }             from "next/server";
import { createPublicClient, http } from "viem";
import { arcTestnet } from "@/lib/wagmi/config";
import { CONDITIONAL_ESCROW_ABI }   from "@/lib/contracts/abis";
import { CHAIN_ID, getContractAddresses } from "@/lib/contracts/addresses";
import type { MilestoneDTO }        from "@/lib/types";

export async function GET() {
  try {
    const rpcUrl = process.env.NEXT_PUBLIC_ARC_RPC_URL || "https://rpc.testnet.arc.io";
    const client = createPublicClient({ chain: arcTestnet, transport: http(rpcUrl) });
    const addr   = getContractAddresses().ConditionalEscrow;

    const count = await client.readContract({
      address: addr, abi: CONDITIONAL_ESCROW_ABI, functionName: "milestoneCount",
    }) as bigint;

    const limit = Number(count) > 50 ? 50 : Number(count);

    // Fetch each milestone by index in parallel
    const milestonePromises = Array.from({ length: limit }, (_, i) =>
      client.readContract({
        address:      addr,
        abi:          CONDITIONAL_ESCROW_ABI,
        functionName: "getMilestone",
        args:         [BigInt(i)],
      })
    );
    const milestones = await Promise.all(milestonePromises) as any[];

    const now = BigInt(Math.floor(Date.now() / 1000));

    // viem returns a plain array for flat named outputs (not a named object)
    // Index mapping: 0=payer, 1=payee, 2=token, 3=amount, 4=approvers,
    //                5=approvalsRequired, 6=approvalCount, 7=disputeDeadline, 8=released, 9=reclaimed
    let metaById = new Map<number, { title: string; description: string }>();
    try {
      const { listMilestoneMetadata } = await import("@/lib/db");
      const rows = await listMilestoneMetadata(CHAIN_ID);
      metaById = new Map(
        rows.map((r) => [Number(r.milestone_id), { title: r.title, description: r.description }])
      );
    } catch {
      // Supabase optional at read time — still return on-chain milestones
    }

    const dtos: MilestoneDTO[] = milestones.map((m: any, i: number) => {
      const released         = m[8]  as boolean;
      const reclaimed        = m[9]  as boolean;
      const disputeDeadline  = m[7]  as bigint;
      const meta             = metaById.get(i);

      let status: MilestoneDTO["status"] = "active";
      if (released)  status = "released";
      else if (reclaimed) status = "reclaimed";
      else if (disputeDeadline > 0n && disputeDeadline < now) status = "expired";

      return {
        id:                String(i),
        payer:             m[0] as string,
        payee:             m[1] as string,
        token:             m[2] as string,
        amount:            String(m[3] as bigint),
        approvers:         Array.from((m[4] as string[]) ?? []),
        approvalsRequired: String(m[5] as bigint),
        approvalCount:     String(m[6] as bigint),
        disputeDeadline:   String(disputeDeadline),
        status,
        title:             meta?.title ?? null,
        description:       meta?.description ?? null,
      };
    });

    return NextResponse.json(
      { milestones: dtos, total: Number(count) },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
