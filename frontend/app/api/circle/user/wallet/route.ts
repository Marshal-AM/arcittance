import { NextResponse } from "next/server";
import { loadServerEnv } from "@/lib/server/env";

export async function POST(req: Request) {
  try {
    loadServerEnv();
    const body = await req.json() as { userToken?: string };
    if (!body.userToken) {
      return NextResponse.json({ error: "userToken required" }, { status: 400 });
    }

    const { createUserWallet } = await import("@/lib/circle/user-client");
    const wallet = await createUserWallet(body.userToken);
    return NextResponse.json(wallet);
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? String(err) }, { status: 500 });
  }
}
