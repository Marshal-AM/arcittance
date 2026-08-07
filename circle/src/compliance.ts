/**
 * Compliance Engine — AML/CTF address screening (blocklist).
 */

const DEFAULT_BLOCKLIST = [
  "0x000000000000000000000000000000000000dEaD",
];

export interface ScreenResult {
  allowed: boolean;
  reason?: string;
}

function loadBlocklist(): Set<string> {
  const raw = process.env.CIRCLE_COMPLIANCE_BLOCKLIST ?? "";
  const entries = raw
    .split(",")
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);

  return new Set([...DEFAULT_BLOCKLIST.map(a => a.toLowerCase()), ...entries]);
}

export function screenAddress(address: string): ScreenResult {
  const normalized = address.trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(normalized)) {
    return { allowed: false, reason: "Invalid recipient address" };
  }

  if (loadBlocklist().has(normalized)) {
    return { allowed: false, reason: "Recipient address is blocklisted for compliance review" };
  }

  return { allowed: true };
}

function isSupabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/** Persist AML review alerts to Supabase when credentials are configured. */
export function alertReview(address: string, reason: string): void {
  if (!isSupabaseConfigured()) return;

  void import("../../db/src/repositories/compliance")
    .then(({ insertComplianceCheck }) =>
      insertComplianceCheck({ address, reason })
    )
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[compliance] alertReview failed:", message);
    });
}
