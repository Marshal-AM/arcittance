import { NextResponse } from "next/server";
import { loadServerEnv } from "@/lib/server/env";

export async function POST(req: Request) {
  try {
    loadServerEnv();
    const body = (await req.json()) as { userToken?: string };

    if (!body.userToken) {
      return NextResponse.json({ error: "userToken is required" }, { status: 400 });
    }

    const { listUserWalletsWithRetry, getUserIdFromToken } = await import("@/lib/circle/user-client");
    const wallets = await listUserWalletsWithRetry(body.userToken);
    const userId = await getUserIdFromToken(body.userToken);

    if (wallets.length === 0) {
      return NextResponse.json(
        { error: "No wallets found yet — retry after wallet creation completes" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      userId,
      wallets: wallets.map((w) => ({
        id:      w.walletId,
        walletId: w.walletId,
        address: w.address,
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? String(err) }, { status: 500 });
  }
}
