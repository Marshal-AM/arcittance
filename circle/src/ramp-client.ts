/**
 * Circle Mint sandbox fiat on-ramp helpers (Path B).
 * Wire bank account → mock deposit → poll deposits.
 */
import { randomUUID } from "crypto";
import { mintFetch } from "./mint-http";

export interface WireBankAccount {
  id: string;
  status?: string;
  trackingRef?: string;
  description?: string;
  raw: Record<string, unknown>;
}

export interface MintDeposit {
  id: string;
  status: string;
  amount?: { amount: string; currency: string };
  createDate?: string;
  raw: Record<string, unknown>;
}

/** True when Circle's sandbox EFT service is down (internal retries exhausted). */
export function isCircleEftSandboxOutage(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("eft-sandbox-eft") ||
    msg.includes("fiatAccounts/wires") ||
    (msg.includes("banks/wires") && msg.includes("500"))
  );
}

/** List existing business wire bank accounts. */
export async function listWireBankAccounts(): Promise<WireBankAccount[]> {
  const { data } = await mintFetch<Array<Record<string, unknown>>>(
    "/v1/businessAccount/banks/wires"
  );
  const rows = Array.isArray(data) ? data : [];
  return rows.map((raw) => ({
    id: String(raw.id),
    status: raw.status as string | undefined,
    trackingRef: raw.trackingRef as string | undefined,
    description: raw.description as string | undefined,
    raw,
  }));
}

/**
 * Register a sandbox wire bank account.
 * Payload matches Circle Mint quickstart (sandbox-accepted ABA + account).
 * @see https://developers.circle.com/circle-mint/quickstarts/mint-and-redeem
 */
export async function createSandboxBankAccount(params?: {
  description?: string;
  idempotencyKey?: string;
}): Promise<WireBankAccount> {
  const body = {
    idempotencyKey: params?.idempotencyKey ?? randomUUID(),
    // Circle sandbox docs use this fixed pair — random account #s often still work,
    // but the documented values are the safest against validation quirks.
    accountNumber: "12340010",
    routingNumber: "121000248",
    billingDetails: {
      name: "Satoshi Nakamoto",
      city: "Boston",
      country: "US",
      line1: "100 Money Street",
      district: "MA",
      postalCode: "01234",
    },
    bankAddress: {
      bankName: "WELLS FARGO BANK, NA",
      city: "San Francisco",
      country: "US",
      line1: "420 Montgomery Street",
      district: "CA",
    },
  };

  const { data } = await mintFetch<Record<string, unknown>>(
    "/v1/businessAccount/banks/wires",
    { method: "POST", body: JSON.stringify(body) }
  );

  return {
    id: String(data.id),
    status: data.status as string | undefined,
    trackingRef: data.trackingRef as string | undefined,
    description: params?.description,
    raw: data,
  };
}

/** Fetch wire instructions (trackingRef + VAN) for mock deposit. */
export async function getWireInstructions(bankAccountId: string): Promise<{
  trackingRef?: string;
  beneficiaryAccountNumber?: string;
  raw: Record<string, unknown>;
}> {
  const { data } = await mintFetch<Record<string, unknown>>(
    `/v1/businessAccount/banks/wires/${bankAccountId}/instructions`
  );
  const beneficiaryBank = data.beneficiaryBank as
    | { accountNumber?: string }
    | undefined;
  return {
    trackingRef: (data.trackingRef as string | undefined) ?? undefined,
    beneficiaryAccountNumber: beneficiaryBank?.accountNumber,
    raw: data,
  };
}

/** Simulate a wire deposit in sandbox (mints USD/USDC balance). */
export async function simulateWireDeposit(params: {
  amount: string;
  currency?: string;
  trackingRef: string;
  beneficiaryAccountNumber: string;
}): Promise<{ id?: string; status?: string; raw: unknown }> {
  const body = {
    amount: {
      amount: Number(params.amount).toFixed(2),
      currency: params.currency ?? "USD",
    },
    trackingRef: params.trackingRef,
    beneficiaryBank: { accountNumber: params.beneficiaryAccountNumber },
  };

  const { data, raw } = await mintFetch<Record<string, unknown>>(
    "/v1/mocks/payments/wire",
    { method: "POST", body: JSON.stringify(body) }
  );

  return {
    id: data?.id != null ? String(data.id) : undefined,
    status: data?.status as string | undefined,
    raw,
  };
}

/** List recent business deposits (poll until complete). */
export async function listDeposits(pageSize = 20): Promise<MintDeposit[]> {
  const { data } = await mintFetch<Array<Record<string, unknown>>>(
    `/v1/businessAccount/deposits?pageSize=${pageSize}`
  );
  const rows = Array.isArray(data) ? data : [];
  return rows.map((raw) => ({
    id: String(raw.id),
    status: String(raw.status ?? "unknown"),
    amount: raw.amount as MintDeposit["amount"],
    createDate: raw.createDate as string | undefined,
    raw,
  }));
}

export async function pollDepositStatus(opts?: {
  timeoutMs?: number;
  pollIntervalMs?: number;
  minAmount?: string;
}): Promise<MintDeposit | null> {
  const timeoutMs = opts?.timeoutMs ?? 60_000;
  const pollIntervalMs = opts?.pollIntervalMs ?? 2_000;
  const min = opts?.minAmount ? Number(opts.minAmount) : 0;
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const deposits = await listDeposits();
    const hit = deposits.find((d) => {
      const ok =
        d.status.toLowerCase() === "complete" ||
        d.status.toLowerCase() === "completed";
      if (!ok) return false;
      if (!min) return true;
      return Number(d.amount?.amount ?? 0) >= min;
    });
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
  return null;
}
