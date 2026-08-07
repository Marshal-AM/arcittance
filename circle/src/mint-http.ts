/**
 * Shared Circle Mint / StableFX sandbox HTTP client.
 * Auth: CIRCLE_MINT_API_KEY || CIRCLE_STABLEFX_API_KEY
 * Base: STABLEFX_API_BASE_URL || https://api-sandbox.circle.com
 */

export const DEFAULT_MINT_BASE_URL = "https://api-sandbox.circle.com";

export function getMintBaseUrl(): string {
  return (
    process.env.STABLEFX_API_BASE_URL?.replace(/\/$/, "") ||
    process.env.CIRCLE_MINT_BASE_URL?.replace(/\/$/, "") ||
    DEFAULT_MINT_BASE_URL
  );
}

export function getMintApiKey(): string {
  const key =
    process.env.CIRCLE_MINT_API_KEY?.trim() ||
    process.env.CIRCLE_STABLEFX_API_KEY?.trim() ||
    "";
  if (!key) {
    throw new Error(
      "CIRCLE_MINT_API_KEY or CIRCLE_STABLEFX_API_KEY is required for Mint/StableFX sandbox APIs"
    );
  }
  return key;
}

export async function mintFetch<T = unknown>(
  path: string,
  init?: RequestInit
): Promise<{ status: number; data: T; raw: unknown }> {
  const url = `${getMintBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${getMintApiKey()}`,
      ...(init?.headers ?? {}),
    },
  });

  const text = await res.text();
  let parsed: unknown = undefined;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { message: text };
    }
  }

  if (!res.ok) {
    const errBody = parsed as { message?: string };
    throw new Error(
      `Circle Mint ${init?.method ?? "GET"} ${path} failed (${res.status}): ` +
        ((errBody?.message ?? text.slice(0, 400)) || res.statusText)
    );
  }

  const envelope = parsed as { data?: T };
  const data = (envelope?.data !== undefined ? envelope.data : parsed) as T;
  return { status: res.status, data, raw: parsed };
}
