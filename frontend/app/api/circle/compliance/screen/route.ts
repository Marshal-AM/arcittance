import { NextResponse } from "next/server";
import { loadServerEnv } from "@/lib/server/env";

export async function GET(req: Request) {
  loadServerEnv();
  const { searchParams } = new URL(req.url);
  const address = searchParams.get("address");
  if (!address) {
    return NextResponse.json({ error: "address query param required" }, { status: 400 });
  }

  const { screenAddress } = await import("@/lib/circle/compliance");
  const result = screenAddress(address);
  return NextResponse.json(result);
}
