/**
 * Circle Stablecoin Payins — payment intents + deposit address polling.
 */
import { randomUUID } from "crypto";
import { mintFetch } from "./mint-http";

export type PayinStatus =
  | "created"
  | "pending"
  | "complete"
  | "expired"
  | "failed"
  | "active"
  | "unknown";

export interface PaymentIntent {
  id: string;
  type?: string;
  status: PayinStatus;
  amount?: { amount: string; currency: string };
  amountPaid?: { amount: string; currency: string };
  settlementCurrency?: string;
  merchantWalletId?: string;
  depositAddress?: string;
  chain?: string;
  timeline?: Array<{ status: string; time?: string }>;
  createDate?: string;
  updateDate?: string;
  raw: Record<string, unknown>;
}

function latestStatus(raw: Record<string, unknown>): PayinStatus {
  const timeline = raw.timeline as Array<{ status?: string }> | undefined;
  const last = timeline?.[timeline.length - 1]?.status?.toLowerCase();
  if (last === "complete" || last === "paid") return "complete";
  if (last === "pending") return "pending";
  if (last === "created") return "created";
  if (last === "expired") return "expired";
  if (last === "failed") return "failed";
  if (last === "active") return "active";
  if (raw.type === "continuous") return "active";
  return "unknown";
}

function extractDepositAddress(raw: Record<string, unknown>): {
  address?: string;
  chain?: string;
} {
  const methods = (raw.paymentMethods ?? []) as Array<Record<string, unknown>>;
  for (const m of methods) {
    const addr =
      (m.address as string | undefined) ??
      ((m.addressInfo as { address?: string } | undefined)?.address);
    if (addr) {
      return { address: addr, chain: (m.chain as string | undefined) ?? "ARC" };
    }
  }
  return {
    address: raw.depositAddress as string | undefined,
    chain: (raw.chain as string | undefined) ?? "ARC",
  };
}

function normalizeIntent(raw: Record<string, unknown>): PaymentIntent {
  const { address, chain } = extractDepositAddress(raw);
  return {
    id: String(raw.id),
    type: raw.type as string | undefined,
    status: latestStatus(raw),
    amount: raw.amount as PaymentIntent["amount"],
    amountPaid: raw.amountPaid as PaymentIntent["amountPaid"],
    settlementCurrency: raw.settlementCurrency as string | undefined,
    merchantWalletId: raw.merchantWalletId != null ? String(raw.merchantWalletId) : undefined,
    depositAddress: address,
    chain,
    timeline: raw.timeline as PaymentIntent["timeline"],
    createDate: raw.createDate as string | undefined,
    updateDate: raw.updateDate as string | undefined,
    raw,
  };
}

export async function createPaymentIntent(params: {
  amount: string;
  currency?: string;
  chain?: string;
  type?: "transient" | "continuous";
  idempotencyKey?: string;
}): Promise<PaymentIntent> {
  const chain = params.chain ?? "ARC";
  const currency = params.currency ?? "USD";
  const type = params.type ?? "transient";

  const body: Record<string, unknown> =
    type === "continuous"
      ? {
          idempotencyKey: params.idempotencyKey ?? randomUUID(),
          currency,
          settlementCurrency: currency,
          paymentMethods: [{ type: "blockchain", chain }],
        }
      : {
          idempotencyKey: params.idempotencyKey ?? randomUUID(),
          type: "transient",
          amount: { amount: params.amount, currency },
          settlementCurrency: currency,
          paymentMethods: [{ type: "blockchain", chain }],
        };

  const { data } = await mintFetch<Record<string, unknown>>("/v1/paymentIntents", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return normalizeIntent(data);
}

export async function getPaymentIntent(paymentIntentId: string): Promise<PaymentIntent> {
  const { data } = await mintFetch<Record<string, unknown>>(
    `/v1/paymentIntents/${paymentIntentId}`
  );
  return normalizeIntent(data);
}

/** Poll until deposit address is assigned (Circle assigns asynchronously). */
export async function waitForDepositAddress(
  paymentIntentId: string,
  opts?: { timeoutMs?: number; pollIntervalMs?: number }
): Promise<PaymentIntent> {
  const timeoutMs = opts?.timeoutMs ?? 60_000;
  const pollIntervalMs = opts?.pollIntervalMs ?? 2_000;
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const intent = await getPaymentIntent(paymentIntentId);
    if (intent.depositAddress) return intent;
    if (["complete", "failed", "expired"].includes(intent.status)) return intent;
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
  return getPaymentIntent(paymentIntentId);
}

export function isPayinSettled(intent: PaymentIntent): boolean {
  if (intent.status === "complete") return true;
  // Circle Payins often use timeline status "paid"
  if (String(intent.status).toLowerCase() === "paid") return true;
  const timeline = intent.timeline ?? [];
  if (timeline.some((t) => String(t.status).toLowerCase() === "paid")) return true;
  const paid = Number(intent.amountPaid?.amount ?? 0);
  const target = Number(intent.amount?.amount ?? 0);
  return target > 0 && paid >= target;
}

/** Poll payment intent until settled or timeout. */
export async function waitForPayinSettled(
  paymentIntentId: string,
  opts?: { timeoutMs?: number; pollIntervalMs?: number }
): Promise<PaymentIntent> {
  const timeoutMs = opts?.timeoutMs ?? 180_000;
  const pollIntervalMs = opts?.pollIntervalMs ?? 3_000;
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const intent = await getPaymentIntent(paymentIntentId);
    if (isPayinSettled(intent)) return intent;
    if (["failed", "expired"].includes(intent.status)) return intent;
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
  return getPaymentIntent(paymentIntentId);
}
