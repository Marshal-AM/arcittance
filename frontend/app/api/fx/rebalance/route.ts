import { NextResponse } from "next/server";
import { loadServerEnv } from "@/lib/server/env";

/**
 * Institutional treasury rebalance — live StableFX USDC ↔ EURC via facilitator.
 */
export async function POST(req: Request) {
  try {
    loadServerEnv();
    const body = await req.json() as {
      fromCurrency?: "USDC" | "EURC";
      toCurrency?: "USDC" | "EURC";
      amount?: string;
    };

    if (!body.amount || Number(body.amount) <= 0) {
      return NextResponse.json({ error: "amount is required" }, { status: 400 });
    }
    if (Number(body.amount) < 10) {
      return NextResponse.json(
        { error: "Minimum rebalance amount is 10 units" },
        { status: 400 }
      );
    }

    const fromCurrency = body.fromCurrency ?? "USDC";
    const toCurrency = body.toCurrency ?? "EURC";
    if (fromCurrency === toCurrency) {
      return NextResponse.json(
        { error: "fromCurrency and toCurrency must differ" },
        { status: 400 }
      );
    }

    const { executeTakerTrade, createFxQuote } = await import("@/lib/circle/stablefx").then(
      async (sfx) => ({
        executeTakerTrade: sfx.executeTakerTrade,
        createFxQuote: (await import("@/lib/db")).createFxQuote,
      })
    );

    const result = await executeTakerTrade({
      fromCurrency,
      toCurrency,
      fromAmount: body.amount,
    });

    const row = await createFxQuote({
      pair: `${fromCurrency}/${toCurrency}`,
      quote_amount: body.amount,
      rate: result.quote.rate,
      spread: result.feeUsdc,
      maker: "circle-stablefx-sandbox",
      status: "settled",
      expires_at: result.quote.expiresAt || null,
      stablefx_quote_id: result.quote.id,
      stablefx_trade_id: result.trade.id,
      metadata: {
        purpose: "institutional-rebalance",
        settlementTransactionHash: result.settlementTransactionHash,
        fxSpreadBps: result.fxSpreadBps,
      },
    });

    return NextResponse.json(
      {
        fxQuoteId: row.id,
        stablefxTradeId: result.trade.id,
        status: result.trade.status,
        rate: result.quote.rate,
        feeUsdc: result.feeUsdc,
        settlementTransactionHash: result.settlementTransactionHash,
        from: result.quote.from,
        to: result.quote.to,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? String(err) }, { status: 500 });
  }
}
