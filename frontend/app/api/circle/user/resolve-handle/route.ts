import { NextResponse } from "next/server";
import { loadServerEnv } from "@/lib/server/env";

export async function GET(req: Request) {
  try {
    loadServerEnv();
    const { searchParams } = new URL(req.url);
    const handle = searchParams.get("handle");
    if (!handle) {
      return NextResponse.json({ error: "handle query param required" }, { status: 400 });
    }

    const { resolveUserHandle } = await import("@/lib/circle/user-client");
    const result = await resolveUserHandle(handle);

    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? String(err) }, { status: 404 });
  }
}
