import { NextResponse } from "next/server";
import { loadServerEnv } from "@/lib/server/env";
import {
  getSupportedChains,
  isChainSupportedForCurrency,
  type PayoutCurrency,
} from "@/lib/circle/supported-chains";

export async function POST(req: Request) {
  try {
    loadServerEnv();
    const body = await req.json() as {
      address?: string;
      chain?: string;
      currency?: PayoutCurrency;
      email?: string;
      nickname?: string;
    };

    if (!body.address || !body.chain) {
      return NextResponse.json({ error: "address and chain required" }, { status: 400 });
    }
    const currency = body.currency ?? "EURC";
    if (!isChainSupportedForCurrency(currency, body.chain)) {
      return NextResponse.json(
        {
          error: `Chain ${body.chain} not supported for ${currency}`,
          supportedChains: getSupportedChains(currency),
        },
        { status: 400 }
      );
    }

    const { addRecipient } = await import("@/lib/circle/payouts-client");
    const recipient = await addRecipient({
      address: body.address,
      chain: body.chain,
      currency,
      email: body.email,
      nickname: body.nickname,
    });

    return NextResponse.json({
      recipientId: recipient.id,
      status: recipient.status,
      chain: recipient.chain ?? body.chain,
      address: recipient.address ?? body.address,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? String(err) }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const currency = (new URL(req.url).searchParams.get("currency") ?? "EURC") as PayoutCurrency;
  return NextResponse.json({
    currency,
    chains: getSupportedChains(currency === "USDC" ? "USDC" : "EURC"),
  });
}
