import { NextResponse } from "next/server";
import { loadServerEnv } from "@/lib/server/env";

export async function POST(req: Request) {
  try {
    loadServerEnv();
    const body = (await req.json()) as { email?: string; deviceId?: string };

    if (!body.email || !body.deviceId) {
      return NextResponse.json(
        { error: "email and deviceId are required" },
        { status: 400 }
      );
    }

    const { requestEmailOtp } = await import("@/lib/circle/user-client");
    const tokens = await requestEmailOtp(body.email, body.deviceId);

    return NextResponse.json({
      success: true,
      ...tokens,
      message: "OTP sent — check your email, then click Verify OTP",
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? String(err) }, { status: 500 });
  }
}
