/**
 * AED ↔ USD/USDC rates for Path B bank-mock.
 * Frankfurter (ECB) does not list AED — use ExchangeRate-API open endpoint
 * (https://open.er-api.com), free, no key. Treat 1 USD = 1 USDC for payout sizing.
 */

const ER_API_AED = "https://open.er-api.com/v6/latest/AED";
const CACHE_TTL_MS = 60_000;

let cached: { rate: number; fetchedAt: number } | null = null;

export interface AedFxQuote {
  /** How many USD/USDC per 1 AED */
  aedToUsd: number;
  /** How many AED per 1 USD/USDC */
  usdToAed: number;
  source: string;
  fetchedAt: string;
}

/** USD per 1 AED (e.g. ~0.272). */
export async function getAedUsdRate(forceRefresh = false): Promise<number> {
  const q = await getAedFxQuote(forceRefresh);
  return q.aedToUsd;
}

export async function getAedFxQuote(forceRefresh = false): Promise<AedFxQuote> {
  if (
    !forceRefresh &&
    cached &&
    Date.now() - cached.fetchedAt < CACHE_TTL_MS
  ) {
    return {
      aedToUsd: cached.rate,
      usdToAed: 1 / cached.rate,
      source: "open.er-api.com (cached)",
      fetchedAt: new Date(cached.fetchedAt).toISOString(),
    };
  }

  const res = await fetch(ER_API_AED, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`AED FX rate fetch failed (${res.status})`);
  }
  const body = (await res.json()) as {
    result?: string;
    rates?: { USD?: number };
  };
  const usd = body.rates?.USD;
  if (body.result !== "success" || typeof usd !== "number" || usd <= 0) {
    throw new Error("AED FX rate response missing rates.USD");
  }

  cached = { rate: usd, fetchedAt: Date.now() };
  return {
    aedToUsd: usd,
    usdToAed: 1 / usd,
    source: "open.er-api.com",
    fetchedAt: new Date(cached.fetchedAt).toISOString(),
  };
}

/** Convert AED → USDC decimal string (2 dp). 1 USD = 1 USDC. */
export function aedToUsdc(aed: string | number, aedToUsd: number): string {
  const n = Number(aed);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error("AED amount must be a positive number");
  }
  if (!Number.isFinite(aedToUsd) || aedToUsd <= 0) {
    throw new Error("Invalid AED→USD rate");
  }
  return (n * aedToUsd).toFixed(2);
}

/** Convert USDC → AED decimal string (2 dp). 1 USD = 1 USDC. */
export function usdcToAed(usdc: string | number, aedToUsd: number): string {
  const n = Number(usdc);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error("USDC amount must be a non-negative number");
  }
  if (!Number.isFinite(aedToUsd) || aedToUsd <= 0) {
    throw new Error("Invalid AED→USD rate");
  }
  return (n / aedToUsd).toFixed(2);
}

/** Test helper — clear in-memory cache. */
export function clearAedFxCache(): void {
  cached = null;
}
