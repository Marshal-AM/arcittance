// frontend/app/api/organizations/route.ts
import { NextResponse } from "next/server";
import { createPublicClient, http, isAddress } from "viem";
import { arcTestnet } from "@/lib/wagmi/config";
import { PAYROLL_ORG_REGISTRY_ABI } from "@/lib/contracts/abis";
import { getPayrollOrgRegistryAddress } from "@/lib/contracts/addresses";
import type { OrganizationDTO } from "@/lib/types";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const creator = searchParams.get("creator");
    if (!creator || !isAddress(creator)) {
      return NextResponse.json({ error: "creator address required" }, { status: 400 });
    }

    const rpcUrl = process.env.NEXT_PUBLIC_ARC_RPC_URL || "https://rpc.testnet.arc.io";
    const client = createPublicClient({ chain: arcTestnet, transport: http(rpcUrl) });
    const registry = getPayrollOrgRegistryAddress();

    const count = await client.readContract({
      address:      registry,
      abi:          PAYROLL_ORG_REGISTRY_ABI,
      functionName: "getCreatorOrgCount",
      args:         [creator as `0x${string}`],
    }) as bigint;

    const orgIds = await Promise.all(
      Array.from({ length: Number(count) }, (_, i) =>
        client.readContract({
          address:      registry,
          abi:          PAYROLL_ORG_REGISTRY_ABI,
          functionName: "getCreatorOrgId",
          args:         [creator as `0x${string}`, BigInt(i)],
        })
      ),
    ) as bigint[];

    const orgs = await Promise.all(
      orgIds.map(id =>
        client.readContract({
          address:      registry,
          abi:          PAYROLL_ORG_REGISTRY_ABI,
          functionName: "getOrganization",
          args:         [id],
        })
      ),
    ) as Array<{
      name: string;
      creator: string;
      vault: string;
      createdAt: bigint;
      vaultCreated: boolean;
    }>;

    const organizations: OrganizationDTO[] = orgs.map((org, i) => ({
      id:           String(orgIds[i]),
      name:         org.name,
      creator:      org.creator,
      vault:        org.vaultCreated ? org.vault : null,
      vaultCreated: org.vaultCreated,
      createdAt:    String(org.createdAt),
    }));

    return NextResponse.json(
      { organizations, total: organizations.length },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
