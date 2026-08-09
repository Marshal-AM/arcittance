import { NextResponse } from "next/server";
import { loadServerEnv } from "@/lib/server/env";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    loadServerEnv();
    const { id } = await params;
    const body = await req.json().catch(() => ({})) as { txHash?: string };
    const { getRemittanceById, updateRemittanceStatus } = await import("@/lib/db");

    const row = await getRemittanceById(id);
    if (!row) {
      return NextResponse.json({ error: "Remittance not found" }, { status: 404 });
    }

    if (body.txHash && !row.tx_hash) {
      await updateRemittanceStatus(id, "pending", body.txHash);
    }

    const current = await getRemittanceById(id);
    if (!current) {
      return NextResponse.json({ error: "Remittance not found" }, { status: 404 });
    }

    if (current.status === "settled") {
      return NextResponse.json({
        status: "settled",
        txHash: current.tx_hash,
      });
    }

    if (current.tx_hash) {
      const updated = await updateRemittanceStatus(id, "settled", current.tx_hash);
      return NextResponse.json({
        status: "settled",
        txHash: updated.tx_hash,
      });
    }

    return NextResponse.json({ status: current.status });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? String(err) }, { status: 500 });
  }
}
