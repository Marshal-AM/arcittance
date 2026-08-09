import { NextResponse } from "next/server";
import { loadServerEnv } from "@/lib/server/env";

export async function POST(req: Request) {
  try {
    loadServerEnv();
    const body = (await req.json()) as { userToken?: string };

    if (!body.userToken) {
      return NextResponse.json({ error: "userToken is required" }, { status: 400 });
    }

    const { initializeUserWalletChallenge } = await import("@/lib/circle/user-client");
    const result = await initializeUserWalletChallenge(body.userToken);

    if (result.alreadyHasWallets) {
      return NextResponse.json({
        code:            155106,
        alreadyHasWallets: true,
        message:         "User already has wallets",
      });
    }

    return NextResponse.json({
      challengeId: result.challengeId,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? String(err) }, { status: 500 });
  }
}
