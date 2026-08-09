// frontend/app/api/subscriptions/route.ts
/**
 * GET /api/subscriptions
 * Returns subscription plans and active subscriptions from SubscriptionManager.
 * Uses plans(id) and subscriptions(id) public mapping getters — avoids eth_getLogs limits.
 */

import { NextResponse }               from "next/server";
import { createPublicClient, http }   from "viem";
import { arcTestnet } from "@/lib/wagmi/config";
import { SUBSCRIPTION_MANAGER_ABI }   from "@/lib/contracts/abis";
import { CHAIN_ID, getContractAddresses } from "@/lib/contracts/addresses";

export async function GET() {
  try {
    const rpcUrl = process.env.NEXT_PUBLIC_ARC_RPC_URL || "https://rpc.testnet.arc.io";
    const client = createPublicClient({ chain: arcTestnet, transport: http(rpcUrl) });
    const addr   = getContractAddresses().SubscriptionManager;

    const [planCount, subCount] = await Promise.all([
      client.readContract({ address: addr, abi: SUBSCRIPTION_MANAGER_ABI, functionName: "planCount" }),
      client.readContract({ address: addr, abi: SUBSCRIPTION_MANAGER_ABI, functionName: "subscriptionCount" }),
    ]) as [bigint, bigint];

    const planLimit = Number(planCount) > 50 ? 50 : Number(planCount);
    const subLimit  = Number(subCount)  > 50 ? 50 : Number(subCount);

    // Fetch all plans and subscriptions in parallel by index
    const [planResults, subResults] = await Promise.all([
      Promise.all(
        Array.from({ length: planLimit }, (_, i) =>
          client.readContract({
            address:      addr,
            abi:          SUBSCRIPTION_MANAGER_ABI,
            functionName: "plans",
            args:         [BigInt(i)],
          })
        )
      ),
      Promise.all(
        Array.from({ length: subLimit }, (_, i) =>
          client.readContract({
            address:      addr,
            abi:          SUBSCRIPTION_MANAGER_ABI,
            functionName: "subscriptions",
            args:         [BigInt(i)],
          })
        )
      ),
    ]) as [any[], any[]];

    let metaById = new Map<number, { title: string; description: string }>();
    try {
      const { listSubscriptionPlanMetadata } = await import("@/lib/db");
      const rows = await listSubscriptionPlanMetadata(CHAIN_ID);
      metaById = new Map(
        rows.map((r) => [Number(r.plan_id), { title: r.title, description: r.description }])
      );
    } catch {
      // Supabase optional at read time
    }

    const plans = planResults.map((p: any, i: number) => {
      const meta = metaById.get(i);
      return {
        id:           String(i),
        provider:     p.provider,
        token:        p.token,
        chargeAmount: String(p.chargeAmount),
        interval:     String(p.interval),
        maxCharges:   String(p.maxCharges),
        chargeCount:  String(p.chargeCount),
        expiry:       String(p.expiry),
        active:       p.active,
        title:        meta?.title ?? null,
        description:  meta?.description ?? null,
      };
    });

    const subscriptions = subResults.map((s: any, i: number) => {
      const planMeta = metaById.get(Number(s.planId));
      return {
        id:            String(i),
        subscriber:    s.subscriber,
        planId:        String(s.planId),
        approvedCap:   String(s.approvedCap),
        totalCharged:  String(s.totalCharged),
        nextChargeDue: String(s.nextChargeDue),
        active:        s.active,
        title:         planMeta?.title ?? null,
        description:   planMeta?.description ?? null,
      };
    });

    return NextResponse.json(
      { plans, subscriptions, totalPlans: Number(planCount), totalSubs: Number(subCount) },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
