import { NextResponse } from "next/server";
import { loadServerEnv } from "@/lib/server/env";
import { destinationLabel } from "@/lib/contracts/addresses";
import type { RemittanceDTO } from "@/lib/types";

export async function GET() {
  try {
    loadServerEnv();
    const { listRemittances } = await import("@/lib/db");

    const rows = await listRemittances(50);
    const remittances: RemittanceDTO[] = rows.map((r) => ({
      id:                 r.id,
      senderAddress:      r.sender_address,
      recipientAddress:   r.recipient_address,
      amount:             r.amount,
      fee:                r.fee,
      destinationChainId: r.destination_chain_id ?? 0,
      destinationName:    destinationLabel(r.destination_chain_id ?? 0),
      routingMethod:      r.routing_method ?? 0,
      status:             r.status,
      txHash:             r.tx_hash,
      attestationHash:    r.attestation_hash,
      createdAt:          r.created_at,
    }));

    return NextResponse.json(
      { remittances, total: remittances.length },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    loadServerEnv();
    const body = await req.json() as {
      senderAddress?: string;
      recipientAddress?: string;
      amount?: string;
      fee?: string;
      destinationChainId?: number;
      routingMethod?: number;
      txHash?: string;
      attestationHash?: string;
      status?: "pending" | "settled" | "failed";
    };

    if (!body.senderAddress || !body.recipientAddress || !body.amount) {
      return NextResponse.json(
        { error: "senderAddress, recipientAddress, and amount are required" },
        { status: 400 }
      );
    }

    const { createRemittance } = await import("@/lib/db");
    const row = await createRemittance({
      sender_address:      body.senderAddress,
      recipient_address:   body.recipientAddress,
      amount:              body.amount,
      fee:                 body.fee ?? "0",
      destination_chain_id: body.destinationChainId,
      routing_method:      body.routingMethod,
      tx_hash:             body.txHash,
      attestation_hash:    body.attestationHash,
      status:              body.status ?? "pending",
    });

    return NextResponse.json({ remittance: row });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? String(err) }, { status: 500 });
  }
}
