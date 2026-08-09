import { NextResponse } from "next/server";

/** Public AED↔USDC quote for Path B bank-mock UI. */
export async function GET() {
  try {
    const { getAedFxQuote } = await import("@/lib/circle/aed-fx");
    const q = await getAedFxQuote();
    return NextResponse.json({
      aedToUsd: q.aedToUsd,
      usdToAed: q.usdToAed,
      source: q.source,
      fetchedAt: q.fetchedAt,
      note: "1 USD = 1 USDC for bank-mock payout sizing",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
