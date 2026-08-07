/**
 * Circle Stablecoin Payouts + Address Book.
 */
import { randomUUID } from "crypto";
import { mintFetch } from "./mint-http";
import { isChainSupportedForCurrency, type PayoutCurrency } from "./supported-chains";

export interface AddressBookRecipient {
  id: string;
  chain?: string;
  address?: string;
  status?: string;
  metadata?: Record<string, unknown>;
  raw: Record<string, unknown>;
}

export interface Payout {
  id: string;
  status: string;
  amount?: { amount: string; currency: string };
  destination?: Record<string, unknown>;
  transactionHash?: string;
  createDate?: string;
  updateDate?: string;
  errorCode?: string;
  raw: Record<string, unknown>;
}

export async function addRecipient(params: {
  chain: string;
  address: string;
  currency: PayoutCurrency;
  email?: string;
  nickname?: string;
  idempotencyKey?: string;
}): Promise<AddressBookRecipient> {
  if (!isChainSupportedForCurrency(params.currency, params.chain)) {
    throw new Error(
      `Chain ${params.chain} is not supported for ${params.currency} payouts`
    );
  }

  const body: Record<string, unknown> = {
    idempotencyKey: params.idempotencyKey ?? randomUUID(),
    chain: params.chain.toUpperCase(),
    address: params.address,
    metadata: {
      nickname: params.nickname ?? "Remittance recipient",
      email: params.email,
    },
  };

  const { data } = await mintFetch<Record<string, unknown>>("/v1/addressBook/recipients", {
    method: "POST",
    body: JSON.stringify(body),
  });

  return {
    id: String(data.id),
    chain: data.chain as string | undefined,
    address: data.address as string | undefined,
    status: data.status as string | undefined,
    metadata: data.metadata as Record<string, unknown> | undefined,
    raw: data,
  };
}

export async function createPayout(params: {
  recipientId: string;
  amount: string;
  currency: PayoutCurrency;
  sourceWalletId?: string;
  idempotencyKey?: string;
  purposeOfTransfer?: string;
}): Promise<Payout> {
  const body: Record<string, unknown> = {
    idempotencyKey: params.idempotencyKey ?? randomUUID(),
    destination: {
      type: "address_book",
      id: params.recipientId,
    },
    amount: {
      amount: params.amount,
      currency: params.currency === "USDC" ? "USD" : "EUR",
    },
  };
  if (params.sourceWalletId) {
    body.source = { type: "wallet", id: params.sourceWalletId };
  }
  if (params.purposeOfTransfer) {
    body.purposeOfTransfer = params.purposeOfTransfer;
  }

  const { data } = await mintFetch<Record<string, unknown>>("/v1/payouts", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return normalizePayout(data);
}

export async function getPayoutStatus(payoutId: string): Promise<Payout> {
  const { data } = await mintFetch<Record<string, unknown>>(`/v1/payouts/${payoutId}`);
  return normalizePayout(data);
}

function normalizePayout(raw: Record<string, unknown>): Payout {
  return {
    id: String(raw.id),
    status: String(raw.status ?? "unknown"),
    amount: raw.amount as Payout["amount"],
    destination: raw.destination as Record<string, unknown> | undefined,
    transactionHash:
      (raw.transactionHash as string | undefined) ??
      ((raw.destination as { transactionHash?: string } | undefined)?.transactionHash),
    createDate: raw.createDate as string | undefined,
    updateDate: raw.updateDate as string | undefined,
    errorCode: raw.errorCode as string | undefined,
    raw,
  };
}

/** Poll until terminal payout status. */
export async function waitForPayoutTerminal(
  payoutId: string,
  opts?: { timeoutMs?: number; pollIntervalMs?: number }
): Promise<Payout> {
  const timeoutMs = opts?.timeoutMs ?? 120_000;
  const pollIntervalMs = opts?.pollIntervalMs ?? 3_000;
  const terminal = new Set(["complete", "completed", "failed", "denied", "cancelled"]);
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const payout = await getPayoutStatus(payoutId);
    if (terminal.has(payout.status.toLowerCase())) return payout;
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
  return getPayoutStatus(payoutId);
}
