import { NextResponse } from "next/server";
import { loadServerEnv } from "@/lib/server/env";

/** Real custodied balance for the signed-in remit user. */
export async function GET(req: Request) {
  try {
    loadServerEnv();
    const userId = new URL(req.url).searchParams.get("userId");
    if (!userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    const { ensureCustodyWalletForUser, getSubWalletBalance } = await import(
      "@/lib/circle/custody-client"
    );
    const { upsertCustodyWallet } = await import("@/lib/db");

    const mapped = await ensureCustodyWalletForUser(userId);
    await upsertCustodyWallet({
      user_id: userId,
      sub_wallet_id: mapped.subWalletId,
    }).catch(() => undefined);

    const balance = await getSubWalletBalance(mapped.subWalletId);

    return NextResponse.json(
      {
        userId,
        walletId: balance.walletId,
        availableUsdc: balance.availableUsdc,
        availableEurc: balance.availableEurc,
        available: balance.available,
        unsettled: balance.unsettled,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? String(err) }, { status: 500 });
  }
}
