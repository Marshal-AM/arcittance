import { NextResponse } from "next/server";
import { loadServerEnv } from "@/lib/server/env";
import { isAddress } from "viem";

export interface MockBankDetails {
  bankName?: string;
  accountOrIban?: string;
  swift?: string;
}

/**
 * Path B bank-mock — AED → USDC via FX, treasury tops up Mint via Payins, ledger credit.
 * Does NOT call Circle wire-bank APIs.
 */
export async function POST(req: Request) {
  try {
    loadServerEnv();
    const body = (await req.json()) as {
      userId?: string;
      aedAmount?: string;
      senderBank?: MockBankDetails;
      recipientBank?: MockBankDetails;
      recipientAddress?: string;
      chain?: string;
    };

    if (!body.userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }
    if (!body.aedAmount || Number(body.aedAmount) <= 0) {
      return NextResponse.json({ error: "aedAmount required" }, { status: 400 });
    }
    if (!body.recipientAddress || !isAddress(body.recipientAddress)) {
      return NextResponse.json(
        { error: "Valid recipientAddress (0x…) required" },
        { status: 400 }
      );
    }

    const { isBankMockPayoutChain, BANK_MOCK_PAYOUT_CHAINS } = await import(
      "@/lib/circle/supported-chains"
    );
    const chain = (body.chain ?? "ARC").toUpperCase();
    if (!isBankMockPayoutChain(chain)) {
      return NextResponse.json(
        {
          error: `chain must be one of ${BANK_MOCK_PAYOUT_CHAINS.join(", ")} for bank-mock`,
        },
        { status: 400 }
      );
    }

    const { getAedFxQuote, aedToUsdc } = await import("@/lib/circle/aed-fx");
    const {
      createPaymentIntent,
      waitForDepositAddress,
      waitForPayinSettled,
      isPayinSettled,
    } = await import("@/lib/circle/payins-client");
    const { sendUsdcFromTreasury, getTreasuryUsdcBalance } = await import(
      "@/lib/circle/treasury-client"
    );
    const {
      createMintLedgerEntry,
      updateMintLedger,
      getAvailableLedgerBalanceUsdc,
    } = await import("@/lib/db");

    const fx = await getAedFxQuote();
    const usdcAmount = aedToUsdc(body.aedAmount, fx.aedToUsd);

    const treasuryBal = await getTreasuryUsdcBalance();
    if (Number(treasuryBal) < Number(usdcAmount)) {
      return NextResponse.json(
        {
          error: `Treasury USDC insufficient: have ${treasuryBal}, need ${usdcAmount}. Fund TREASURY_PRIVATE_KEY wallet on Arc.`,
        },
        { status: 400 }
      );
    }

    const ledger = await createMintLedgerEntry({
      sender_user_id: body.userId,
      amount: usdcAmount,
      currency: "USD",
      status: "pending",
    });

    await updateMintLedger(ledger.id, {
      metadata: {
        path: "B_MOCK",
        aedAmount: body.aedAmount,
        usdcAmount,
        rate: fx.aedToUsd,
        usdToAed: fx.usdToAed,
        fxSource: fx.source,
        senderBank: body.senderBank ?? {},
        recipientBank: body.recipientBank ?? {},
        recipientAddress: body.recipientAddress,
        chain,
      },
    });

    let intent = await createPaymentIntent({
      amount: usdcAmount,
      currency: "USD",
      chain: "ARC",
      type: "transient",
    });
    intent = await waitForDepositAddress(intent.id, { timeoutMs: 90_000 });
    if (!intent.depositAddress) {
      await updateMintLedger(ledger.id, {
        status: "failed",
        metadata: { path: "B_MOCK", payinError: "No deposit address", intent },
      });
      return NextResponse.json(
        { error: "Payins deposit address not assigned", ledgerId: ledger.id },
        { status: 502 }
      );
    }

    const transfer = await sendUsdcFromTreasury({
      to: intent.depositAddress,
      amount: usdcAmount,
    });

    await updateMintLedger(ledger.id, {
      status: "deposited",
      deposit_id: intent.id,
      mint_tx_hash: transfer.txHash,
      metadata: {
        path: "B_MOCK",
        aedAmount: body.aedAmount,
        usdcAmount,
        rate: fx.aedToUsd,
        usdToAed: fx.usdToAed,
        fxSource: fx.source,
        senderBank: body.senderBank ?? {},
        recipientBank: body.recipientBank ?? {},
        recipientAddress: body.recipientAddress,
        chain,
        paymentIntentId: intent.id,
        depositAddress: intent.depositAddress,
        treasuryTxHash: transfer.txHash,
        treasuryFrom: transfer.from,
      },
    });

    const settled = await waitForPayinSettled(intent.id, { timeoutMs: 180_000 });
    const paid = isPayinSettled(settled);

    await updateMintLedger(ledger.id, {
      status: paid ? "minted" : "deposited",
      deposit_id: settled.id,
      mint_tx_hash: transfer.txHash,
      metadata: {
        path: "B_MOCK",
        aedAmount: body.aedAmount,
        usdcAmount,
        rate: fx.aedToUsd,
        usdToAed: fx.usdToAed,
        fxSource: fx.source,
        senderBank: body.senderBank ?? {},
        recipientBank: body.recipientBank ?? {},
        recipientAddress: body.recipientAddress,
        chain,
        paymentIntentId: settled.id,
        depositAddress: intent.depositAddress,
        treasuryTxHash: transfer.txHash,
        treasuryFrom: transfer.from,
        payinStatus: settled.status,
        amountPaid: settled.amountPaid,
      },
    });

    const available = await getAvailableLedgerBalanceUsdc(body.userId);

    return NextResponse.json({
      ledgerId: ledger.id,
      status: paid ? "minted" : settled.status,
      aedAmount: body.aedAmount,
      usdcAmount,
      rate: fx.aedToUsd,
      usdToAed: fx.usdToAed,
      fxSource: fx.source,
      paymentIntentId: settled.id,
      treasuryTxHash: transfer.txHash,
      recipientAddress: body.recipientAddress,
      chain,
      availableLedgerUsdc: available,
      warning: paid
        ? undefined
        : "Payins not yet marked paid — Mint balance may still settle; you can retry send shortly.",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
