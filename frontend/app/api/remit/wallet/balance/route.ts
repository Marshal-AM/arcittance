import { NextResponse } from "next/server";
import { loadServerEnv } from "@/lib/server/env";

/** Path A — live balances for the signed-in Circle embedded wallet. */
export async function GET(req: Request) {
  try {
    loadServerEnv();
    const { searchParams } = new URL(req.url);
    const userToken = searchParams.get("userToken");
    const walletId = searchParams.get("walletId");
    if (!userToken || !walletId) {
      return NextResponse.json(
        { error: "userToken and walletId required" },
        { status: 400 }
      );
    }

    const { getWalletBalance } = await import("@/lib/circle/wallet-balance");
    const balance = await getWalletBalance(userToken, walletId);

    return NextResponse.json(balance, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? String(err) }, { status: 500 });
  }
}
