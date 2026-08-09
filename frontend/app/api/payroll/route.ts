// frontend/app/api/payroll/route.ts
import { NextResponse } from "next/server";
import { createPublicClient, http, isAddress } from "viem";
import { arcTestnet } from "@/lib/wagmi/config";
import { PAYROLL_VAULT_ABI } from "@/lib/contracts/abis";
import { DESTINATION_CHAIN_NAMES } from "@/lib/contracts/addresses";
import type { EmployeeDTO } from "@/lib/types";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const vaultParam = searchParams.get("vault");
    if (!vaultParam || !isAddress(vaultParam)) {
      return NextResponse.json({ error: "vault address required" }, { status: 400 });
    }
    const vaultAddr = vaultParam as `0x${string}`;

    const rpcUrl = process.env.NEXT_PUBLIC_ARC_RPC_URL || "https://rpc.testnet.arc.io";
    const client = createPublicClient({ chain: arcTestnet, transport: http(rpcUrl) });

    const count = await client.readContract({
      address:      vaultAddr,
      abi:          PAYROLL_VAULT_ABI,
      functionName: "employeeCount",
    }) as bigint;

    const limit = Number(count) > 50 ? 50 : Number(count);
    const employeePromises = Array.from({ length: limit }, (_, i) =>
      client.readContract({
        address:      vaultAddr,
        abi:          PAYROLL_VAULT_ABI,
        functionName: "getEmployee",
        args:         [BigInt(i)],
      })
    );
    const employees = await Promise.all(employeePromises) as any[];

    const dtos: EmployeeDTO[] = employees.map((emp, i) => ({
      id:                 String(i),
      wallet:             emp.wallet,
      salaryAmount:       String(emp.salaryAmount),
      payToken:           emp.payToken,
      payInterval:        String(emp.payInterval),
      nextPaymentDue:     String(emp.nextPaymentDue),
      approvedCap:        String(emp.approvedCap),
      destinationChainId: emp.destinationChainId,
      destinationName:  DESTINATION_CHAIN_NAMES[emp.destinationChainId]
                          ?? `Domain ${emp.destinationChainId}`,
      routingMethod:      emp.routingMethod ?? 0,
      transferSpeed:      emp.transferSpeed ?? 0,
      active:             emp.active,
    }));

    return NextResponse.json(
      { employees: dtos, total: Number(count), vault: vaultAddr },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
