import { NextResponse } from "next/server";
import { loadServerEnv } from "@/lib/server/env";
import { destinationLabel, ROUTING_METHOD_LABELS } from "@/lib/contracts/addresses";
import { formatUsdcBaseUnits } from "@/lib/fees";
import type { ReceiptData } from "@/lib/receipts/generateReceipt";

export const runtime = "nodejs";

function buildReceiptData(
  row: {
    id: string;
    sender_address: string;
    recipient_address: string;
    amount: string;
    fee: string;
    destination_chain_id: number | null;
    routing_method: number | null;
    tx_hash: string | null;
    attestation_hash: string | null;
    created_at: string;
  },
  legs?: ReceiptData["legs"]
): ReceiptData {
  const amount = formatUsdcBaseUnits(row.amount);
  const fee = formatUsdcBaseUnits(row.fee || "0");
  let net = amount;
  try {
    net = formatUsdcBaseUnits(BigInt(row.amount) - BigInt(row.fee || "0"));
  } catch {
    // leave as amount
  }

  const routing =
    ROUTING_METHOD_LABELS[row.routing_method ?? -1] ??
    (row.routing_method === 0
      ? "CCTP"
      : row.routing_method === 1
        ? "Gateway"
        : "Dual-rail remittance");

  return {
    id: row.id,
    sender: row.sender_address,
    recipient: row.recipient_address,
    amount,
    fee,
    netAmount: net,
    destination: destinationLabel(row.destination_chain_id ?? 0),
    routingMethod: routing,
    txHash: row.tx_hash,
    attestationHash: row.attestation_hash,
    timestamp: new Date(row.created_at).toISOString(),
    legs,
  };
}

function maskRef(ref?: string | null): string | undefined {
  if (!ref) return undefined;
  if (ref.length <= 6) return "***";
  return `${ref.slice(0, 3)}…${ref.slice(-3)}`;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    loadServerEnv();
    const { id } = await params;
    const { getRemittanceById, createReceipt } = await import("@/lib/db");
    const { generateReceiptPdf, generateReceiptJson } = await import(
      "@/lib/receipts/generateReceipt"
    );

    const row = await getRemittanceById(id);
    if (!row) {
      return NextResponse.json({ error: "Remittance not found" }, { status: 404 });
    }

    const legs: ReceiptData["legs"] = {};

    try {
      const { getSupabaseClient } = await import("../../../../../../db/src/client");
      const supabase = getSupabaseClient();

      const payoutQ = await supabase
        .from("payouts")
        .select("*")
        .eq("remittance_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const fxQ = await supabase
        .from("fx_quotes")
        .select("*")
        .eq("remittance_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // Path B mint ledger linked via metadata.remittanceId
      const mintQ = await supabase
        .from("mint_ledger")
        .select("*")
        .contains("metadata", { remittanceId: id })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (mintQ.data) {
        const m = mintQ.data as Record<string, unknown>;
        const meta = (m.metadata ?? {}) as Record<string, unknown>;
        const bank = meta.bank as { trackingRef?: string; id?: string } | undefined;
        legs.funding = {
          path: "B",
          bankRefMasked: maskRef(bank?.trackingRef ?? bank?.id ?? (m.bank_account_id as string)),
          mintTxHash: m.mint_tx_hash ? String(m.mint_tx_hash) : undefined,
          amount: String(m.amount ?? ""),
          status: String(m.status ?? ""),
        };
      }

      if (fxQ.data) {
        const f = fxQ.data as Record<string, unknown>;
        const meta = (f.metadata ?? {}) as Record<string, unknown>;
        legs.fx = {
          quoteId: String(f.id),
          tradeId: f.stablefx_trade_id ? String(f.stablefx_trade_id) : undefined,
          rate: f.rate != null ? String(f.rate) : undefined,
          fee: f.spread != null ? String(f.spread) : (meta.fee as string | undefined),
          settlementTxHash: meta.settlementTransactionHash as string | undefined,
          pair: String(f.pair ?? "USDC/EURC"),
        };

        if (!legs.funding && meta.fundingPath === "B") {
          legs.funding = {
            path: "B",
            amount: String(meta.fromAmount ?? f.quote_amount ?? ""),
            status: "minted",
          };
        }

        const payinId = meta.payinId as string | undefined;
        if (payinId) {
          const payinQ = await supabase
            .from("payins")
            .select("*")
            .eq("id", payinId)
            .maybeSingle();
          if (payinQ.data) {
            const p = payinQ.data as Record<string, unknown>;
            legs.payin = {
              paymentIntentId: String(p.payment_intent_id ?? ""),
              amount: String(p.amount ?? ""),
              status: String(p.status ?? ""),
              receivedAt: p.received_at ? String(p.received_at) : undefined,
              depositAddress: p.deposit_address ? String(p.deposit_address) : undefined,
            };
          }
        }
      }

      if (!legs.funding && !legs.payin) {
        // Path A default: wallet balance used
        legs.funding = {
          path: "A",
          walletAddress: row.sender_address,
          amount: formatUsdcBaseUnits(row.amount),
          status: "complete",
        };
      }

      if (payoutQ.data) {
        const po = payoutQ.data as Record<string, unknown>;
        const currency = String(po.currency ?? "USDC");
        const isFiat = ["USD", "EUR"].includes(currency.toUpperCase());
        legs.delivery = {
          mode: isFiat ? "fiat" : "crypto",
          method: isFiat ? "bank" : "payouts",
          payoutId: String(po.payout_id ?? ""),
          amount: String(po.amount ?? ""),
          currency,
          status: String(po.status ?? ""),
          txHash: po.tx_hash ? String(po.tx_hash) : undefined,
          chain: po.chain ? String(po.chain) : undefined,
        };
        legs.payout = legs.delivery;
      } else if (row.tx_hash) {
        const method =
          row.routing_method === 1
            ? "gateway"
            : row.routing_method === 0
              ? "cctp"
              : "local";
        legs.delivery = {
          mode: "crypto",
          method,
          txHash: row.tx_hash,
          status: row.status === "settled" ? "complete" : String(row.status),
          amount: formatUsdcBaseUnits(row.amount),
          currency: "USDC",
        };
      }
    } catch {
      // Migrations may not be applied yet
      if (!legs.funding) {
        legs.funding = {
          path: "A",
          walletAddress: row.sender_address,
          status: "complete",
        };
      }
    }

    const receiptData = buildReceiptData(row, Object.keys(legs).length ? legs : undefined);

    await createReceipt({
      attestation_hash: row.attestation_hash ?? `receipt-${id}`,
      type: "single",
      remittance_id: id,
      payload: receiptData as unknown as Record<string, unknown>,
    }).catch(() => undefined);

    try {
      const pdf = await generateReceiptPdf(receiptData);
      return new NextResponse(new Uint8Array(pdf), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="arcittance-receipt-${id}.pdf"`,
          "Cache-Control": "no-store, max-age=0",
        },
      });
    } catch (pdfErr) {
      console.warn("[receipt] PDF generation failed, falling back to JSON:", pdfErr);
      const json = generateReceiptJson(receiptData);
      return new NextResponse(json, {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="arcittance-receipt-${id}.json"`,
          "Cache-Control": "no-store, max-age=0",
        },
      });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? String(err) }, { status: 500 });
  }
}
