import { NextResponse } from "next/server";
import { loadServerEnv } from "@/lib/server/env";

type FxCurrency = "USDC" | "EURC";

/**
 * POST — request a live StableFX quote (USDC↔EURC either direction).
 * GET  — poll a stored fx_quotes row by id.
 */
export async function GET(req: Request) {
  try {
    loadServerEnv();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id query param required" }, { status: 400 });
    }
    const { getFxQuoteById } = await import("@/lib/db");
    const row = await getFxQuoteById(id);
    if (!row) {
      return NextResponse.json({ error: "Quote not found" }, { status: 404 });
    }
    return NextResponse.json(
      { quote: row },
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
      amount?: string;
      /** @deprecated use amount + fromCurrency */
      usdcAmount?: string;
      userId?: string;
      payinId?: string;
      remittanceId?: string;
      fromCurrency?: FxCurrency;
      toCurrency?: FxCurrency;
      /** Path B: check mint_ledger instead of Path A wallet */
      skipBalanceCheck?: boolean;
      /** Path A: Circle wallet token balances */
      userToken?: string;
      walletId?: string;
      fundingPath?: "A" | "B";
    };

    const fromCurrency: FxCurrency = body.fromCurrency ?? "USDC";
    const toCurrency: FxCurrency = body.toCurrency ?? "EURC";
    const amount = body.amount ?? body.usdcAmount;

    if (!amount || Number(amount) <= 0) {
      return NextResponse.json({ error: "amount required" }, { status: 400 });
    }
    if (fromCurrency === toCurrency) {
      return NextResponse.json(
        { error: "fromCurrency and toCurrency must differ" },
        { status: 400 }
      );
    }
    if (
      (fromCurrency !== "USDC" && fromCurrency !== "EURC") ||
      (toCurrency !== "USDC" && toCurrency !== "EURC")
    ) {
      return NextResponse.json(
        { error: "StableFX supports USDC and EURC only" },
        { status: 400 }
      );
    }

    // Circle StableFX sandbox typically requires ~10 notional on the from side
    if (Number(amount) < 10) {
      return NextResponse.json(
        { error: `Minimum convert amount is 10 ${fromCurrency}` },
        { status: 400 }
      );
    }

    if (body.skipBalanceCheck && body.userId) {
      // Path B: app ledger attributed to sender (shared facilitator wallet)
      const { getAvailableLedgerBalanceUsdc } = await import("@/lib/db");
      const available = await getAvailableLedgerBalanceUsdc(body.userId);
      if (fromCurrency === "USDC" && Number(available) < Number(amount)) {
        return NextResponse.json(
          {
            error: `Insufficient Path B ledger balance: have ${available} USDC, need ${amount}`,
            availableLedgerUsdc: available,
          },
          { status: 400 }
        );
      }
    } else if (body.userToken && body.walletId) {
      const { getWalletBalance } = await import("@/lib/circle/wallet-balance");
      const balance = await getWalletBalance(body.userToken, body.walletId);
      const available = fromCurrency === "USDC" ? balance.usdc : balance.eurc;
      if (Number(available) < Number(amount)) {
        return NextResponse.json(
          {
            error: `Insufficient wallet ${fromCurrency}: have ${available}, need ${amount}`,
            usdc: balance.usdc,
            eurc: balance.eurc,
          },
          { status: 400 }
        );
      }
    }

    const {
      requestQuote,
      getFacilitatorAddress,
      feeToSpreadBps,
    } = await import("@/lib/circle/stablefx");

    const recipientAddress = await getFacilitatorAddress();

    const sfx = await requestQuote({
      from: { currency: fromCurrency, amount },
      to: { currency: toCurrency },
      tenor: "instant",
      type: "tradable",
      recipientAddress,
    });

    const spreadBps = feeToSpreadBps(sfx.fee, amount);
    const { createFxQuote } = await import("@/lib/db");

    const row = await createFxQuote({
      pair: `${fromCurrency}/${toCurrency}`,
      quote_amount: amount,
      rate: sfx.rate,
      spread: sfx.fee,
      maker: "circle-stablefx-sandbox",
      status: "quoted",
      expires_at: sfx.expiresAt || null,
      stablefx_quote_id: sfx.id,
      remittance_id: body.remittanceId,
      metadata: {
        fromCurrency,
        toCurrency,
        fromAmount: amount,
        usdcAmount: fromCurrency === "USDC" ? amount : sfx.to.amount,
        fee: sfx.fee,
        fxSpreadBps: spreadBps,
        toAmount: sfx.to.amount,
        recipientAddress,
        source: "stablefx-live",
        payinId: body.payinId ?? null,
        userId: body.userId ?? null,
        fundingPath: body.fundingPath ?? (body.skipBalanceCheck ? "B" : "A"),
      },
    });

    return NextResponse.json(
      {
        id: row.id,
        stablefxQuoteId: sfx.id,
        pair: row.pair,
        fromCurrency,
        toCurrency,
        fromAmount: amount,
        usdcAmount: fromCurrency === "USDC" ? amount : undefined,
        rate: sfx.rate,
        fee: sfx.fee,
        fxSpreadBps: spreadBps,
        toAmount: sfx.to.amount,
        expiresAt: sfx.expiresAt,
        status: row.status,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? String(err) }, { status: 500 });
  }
}
