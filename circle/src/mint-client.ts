/**
 * Circle Mint — mint fiat balance out to an onchain wallet (Path B).
 * Confirmed flow (Circle docs): recipient address allowlist →
 * POST /v1/businessAccount/transfers with destination.type = verified_blockchain.
 */
import { randomUUID } from "crypto";
import { mintFetch } from "./mint-http";

export interface RecipientAddress {
  id: string;
  address: string;
  chain: string;
  currency?: string;
  status?: string;
  raw: Record<string, unknown>;
}

export interface BusinessTransfer {
  id: string;
  status: string;
  transactionHash?: string;
  amount?: { amount: string; currency: string };
  raw: Record<string, unknown>;
}

/** Allowlist an external blockchain address for outbound Mint transfers. */
export async function createRecipientAddress(params: {
  address: string;
  chain?: string;
  currency?: string;
  description?: string;
  idempotencyKey?: string;
}): Promise<RecipientAddress> {
  const body = {
    idempotencyKey: params.idempotencyKey ?? randomUUID(),
    address: params.address,
    chain: params.chain ?? "ARC",
    currency: params.currency ?? "USD",
    description: params.description ?? "Arcittance Path B facilitator",
  };

  const { data } = await mintFetch<Record<string, unknown>>(
    "/v1/businessAccount/wallets/addresses/recipient",
    { method: "POST", body: JSON.stringify(body) }
  );

  return {
    id: String(data.id),
    address: String(data.address ?? params.address),
    chain: String(data.chain ?? params.chain ?? "ARC"),
    currency: data.currency as string | undefined,
    status: data.status as string | undefined,
    raw: data,
  };
}

/**
 * Move Mint account USDC/EURC onchain to an allowlisted address
 * (facilitator wallet for Path B).
 */
export async function mintToOnchainWallet(params: {
  amount: string;
  currency?: "USD" | "EUR";
  addressId: string;
  idempotencyKey?: string;
}): Promise<BusinessTransfer> {
  const body = {
    idempotencyKey: params.idempotencyKey ?? randomUUID(),
    destination: {
      type: "verified_blockchain",
      addressId: params.addressId,
    },
    amount: {
      amount: Number(params.amount).toFixed(2),
      currency: params.currency ?? "USD",
    },
  };

  const { data } = await mintFetch<Record<string, unknown>>(
    "/v1/businessAccount/transfers",
    { method: "POST", body: JSON.stringify(body) }
  );

  return normalizeTransfer(data);
}

export async function getBusinessTransfer(id: string): Promise<BusinessTransfer> {
  const { data } = await mintFetch<Record<string, unknown>>(
    `/v1/businessAccount/transfers/${id}`
  );
  return normalizeTransfer(data);
}

function normalizeTransfer(raw: Record<string, unknown>): BusinessTransfer {
  return {
    id: String(raw.id),
    status: String(raw.status ?? "unknown"),
    transactionHash: raw.transactionHash as string | undefined,
    amount: raw.amount as BusinessTransfer["amount"],
    raw,
  };
}

/** Create a fiat wire payout from Mint business account (fiat delivery). */
export async function createBusinessBankPayout(params: {
  amount: string;
  currency?: string;
  destinationBankId: string;
  idempotencyKey?: string;
}): Promise<{ id: string; status: string; raw: Record<string, unknown> }> {
  const body = {
    idempotencyKey: params.idempotencyKey ?? randomUUID(),
    amount: {
      amount: Number(params.amount).toFixed(2),
      currency: params.currency ?? "USD",
    },
    destination: {
      type: "wire",
      id: params.destinationBankId,
    },
  };

  const { data } = await mintFetch<Record<string, unknown>>(
    "/v1/businessAccount/payouts",
    { method: "POST", body: JSON.stringify(body) }
  );

  return {
    id: String(data.id),
    status: String(data.status ?? "pending"),
    raw: data,
  };
}

export async function getBusinessBankPayout(id: string): Promise<{
  id: string;
  status: string;
  raw: Record<string, unknown>;
}> {
  const { data } = await mintFetch<Record<string, unknown>>(
    `/v1/businessAccount/payouts/${id}`
  );
  return {
    id: String(data.id),
    status: String(data.status ?? "unknown"),
    raw: data,
  };
}
