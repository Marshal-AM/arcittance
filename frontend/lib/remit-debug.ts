/**
 * Structured remittance debug logs — filter DevTools console by "Arcittance Remit".
 * Copy the JSON block from any log line when reporting issues.
 */

const TAG = "Arcittance Remit";

function redactSecret(value: string, label = "secret"): string {
  if (!value) return "(empty)";
  if (value.length <= 12) return `${label}(len=${value.length})`;
  return `${label}:${value.slice(0, 6)}…${value.slice(-4)}(len=${value.length})`;
}

function sanitizeValue(key: string, value: unknown): unknown {
  if (value === null || value === undefined) return value;

  const lower = key.toLowerCase();
  if (
    lower.includes("token") ||
    lower.includes("encryptionkey") ||
    lower === "otp"
  ) {
    return typeof value === "string" ? redactSecret(value, key) : "(redacted)";
  }

  if (typeof value === "object" && !Array.isArray(value)) {
    return sanitizeRecord(value as Record<string, unknown>);
  }

  return value;
}

export function sanitizeRecord(
  record: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    out[key] = sanitizeValue(key, value);
  }
  return out;
}

export function remitDebug(
  step: string,
  data?: Record<string, unknown>
): void {
  const payload = {
    tag: TAG,
    ts: new Date().toISOString(),
    step,
    ...(data ? sanitizeRecord(data) : {}),
  };

  // Single JSON line — easy to copy-paste from the console.
  console.log(`[${TAG}] ${step}`, JSON.stringify(payload, null, 2));
}

export async function remitDebugFetch(
  step: string,
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const url = typeof input === "string" ? input : input.toString();
  let requestBody: unknown;
  if (init?.body && typeof init.body === "string") {
    try {
      requestBody = JSON.parse(init.body);
    } catch {
      requestBody = init.body;
    }
  }

  remitDebug(`${step} → request`, {
    url,
    method: init?.method ?? "GET",
    body:
      requestBody && typeof requestBody === "object"
        ? sanitizeRecord(requestBody as Record<string, unknown>)
        : requestBody,
  });

  const started = Date.now();
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch (err: unknown) {
    remitDebug(`${step} ← network_error`, {
      url,
      message: err instanceof Error ? err.message : String(err),
      elapsedMs: Date.now() - started,
    });
    throw err;
  }
  const elapsedMs = Date.now() - started;

  const clone = res.clone();
  let responseBody: unknown;
  try {
    responseBody = await clone.json();
  } catch {
    responseBody = await clone.text().catch(() => "(unreadable body)");
  }

  remitDebug(`${step} ← response`, {
    url,
    status: res.status,
    ok: res.ok,
    elapsedMs,
    body:
      responseBody && typeof responseBody === "object"
        ? sanitizeRecord(responseBody as Record<string, unknown>)
        : responseBody,
  });

  return res;
}
