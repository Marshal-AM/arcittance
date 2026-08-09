import { loadServerEnv } from "@/lib/server/env";
import type { StableFxProgressEvent } from "@/lib/circle/stablefx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Settle StableFX from a stored fx_quotes intent.
 * Streams NDJSON progress lines so the UI can show live stages
 * (quote → sign → create trade → fund → poll).
 */
export async function POST(req: Request) {
  loadServerEnv();
  const body = await req.json() as {
    quoteId?: string;
    remittanceId?: string;
    userId?: string;
    useEoaSigner?: boolean;
    walletId?: string;
    signerAddress?: string;
    /** Path A: after StableFX, send `to` currency from facilitator → this address */
    deliverToAddress?: string;
  };

  if (!body.quoteId) {
    return Response.json({ error: "quoteId is required" }, { status: 400 });
  }

  const quoteIdForFail = body.quoteId;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
      };

      try {
        const { getFxQuoteById, updateFxQuote } = await import("@/lib/db");
        const row = await getFxQuoteById(body.quoteId!);
        if (!row) {
          send({ stage: "error", message: "Quote not found", error: "Quote not found" });
          controller.close();
          return;
        }
        if (row.status !== "quoted" && row.status !== "expired") {
          const error = `Quote status is ${row.status}, expected quoted`;
          send({ stage: "error", message: error, error });
          controller.close();
          return;
        }

        if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
          send({
            stage: "info",
            message: "Indicative quote past TTL — re-quoting live at settle",
            elapsedMs: 0,
          });
        }

        const meta = (row.metadata ?? {}) as Record<string, unknown>;
        const pair = row.pair.split("/");
        const fromCurrency = (pair[0] ?? "USDC") as "USDC" | "EURC";
        const toCurrency = (pair[1] ?? "EURC") as "USDC" | "EURC";
        const fromAmount = String(
          meta.fromAmount ?? row.quote_amount ?? meta.usdcAmount ?? "0"
        );

        send({
          stage: "start",
          message: `Settling ${fromAmount} ${fromCurrency} → ${toCurrency}`,
          elapsedMs: 0,
          detail: { quoteId: row.id, fromAmount, fromCurrency, toCurrency },
        });

        const { executeTakerTrade } = await import("@/lib/circle/stablefx");

        const result = await executeTakerTrade({
          fromCurrency,
          toCurrency,
          fromAmount,
          recipientAddress:
            body.signerAddress ?? (meta.recipientAddress as string | undefined),
          useEoaSigner: body.useEoaSigner === true,
          walletId: body.walletId,
          onProgress: (event: StableFxProgressEvent) => {
            send({ ...event });
          },
        });

        let deliveryTxHash: string | undefined;
        const deliverAmount =
          result.trade.to?.amount || result.quote.to.amount;
        if (body.deliverToAddress && deliverAmount) {
          send({
            stage: "deliver_to_wallet",
            message: `Sending ${deliverAmount} ${toCurrency} to your wallet…`,
            elapsedMs: 0,
          });
          const { transferFromFacilitator } = await import(
            "../../../../../circle/src/facilitator-transfer"
          );
          const delivered = await transferFromFacilitator({
            currency: toCurrency,
            to: body.deliverToAddress,
            amount: deliverAmount,
          });
          deliveryTxHash = delivered.txHash;
          send({
            stage: "deliver_to_wallet",
            message: `Delivered ${delivered.amountSent} ${toCurrency} · tx ${delivered.txHash.slice(0, 12)}…`,
            elapsedMs: 0,
            detail: {
              txHash: delivered.txHash,
              to: body.deliverToAddress,
              amountSent: delivered.amountSent,
            },
          });
        }

        await updateFxQuote(row.id, {
          status: "settled",
          stablefx_trade_id: result.trade.id,
          remittance_id: body.remittanceId,
          metadata: {
            ...meta,
            tradeStatus: result.trade.status,
            settlementTransactionHash: result.settlementTransactionHash,
            feeUsdc: result.feeUsdc,
            fxSpreadBps: result.fxSpreadBps,
            contractTradeId: result.trade.contractTradeId,
            liveQuoteId: result.quote.id,
          },
        });

        send({
          stage: "done",
          message: `Converted — trade ${result.trade.status}`,
          elapsedMs: 0,
          quoteId: row.id,
          stablefxQuoteId: result.quote.id,
          stablefxTradeId: result.trade.id,
          status: result.trade.status,
          settlementTransactionHash:
            deliveryTxHash ?? result.settlementTransactionHash,
          feeUsdc: result.feeUsdc,
          fxSpreadBps: result.fxSpreadBps,
          fromCurrency,
          toCurrency,
          fromAmount,
          toAmount: result.quote.to.amount,
          deliveryTxHash: deliveryTxHash ?? null,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[fx/execute]", message);
        try {
          const { updateFxQuote } = await import("@/lib/db");
          await updateFxQuote(quoteIdForFail, { status: "failed" });
        } catch {
          // ignore
        }
        send({ stage: "error", message, error: message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
