import { NextResponse } from "next/server";

/**
 * Deprecated for consumer remit (Phase 10 redo).
 * FXSettlementEscrow is no longer used on /remit — StableFX settlement is the PvP guarantee.
 * Kept as a no-op so old clients do not 404.
 */
export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      deprecated: true,
      message:
        "FXSettlementEscrow confirm-payout is deprecated for /remit. Use StableFX execute + /api/remit/payouts.",
    },
    { status: 410 }
  );
}
