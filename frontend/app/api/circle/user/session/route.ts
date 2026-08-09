import { NextResponse } from "next/server";
import { loadServerEnv } from "@/lib/server/env";

/**
 * @deprecated Use request-otp + Web SDK verify + initialize flow instead.
 */
export async function POST(req: Request) {
  return NextResponse.json(
    {
      error:
        "Use the updated /remit sign-in flow (Send OTP → Verify OTP). " +
        "The old session endpoint is disabled.",
    },
    { status: 410 }
  );
}
