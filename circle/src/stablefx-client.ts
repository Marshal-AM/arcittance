/**
 * Circle StableFX RFQ client — live sandbox/production API (no local mock RFQ).
 * Base URL: STABLEFX_API_BASE_URL (default https://api-sandbox.circle.com)
 * Auth: CIRCLE_STABLEFX_API_KEY
 *
 * Taker flow: quote → create trade → sign intent → fund (Permit2) → wait settled.
 * EIP-712 signatures use the facilitator developer-controlled wallet (or FACILITATOR_PRIVATE_KEY).
 */

import { randomUUID } from "crypto";
import { ethers } from "ethers";
import { getCircleConfig } from "./config";
import {
  ARC_RPC_URL,
  EURC_ADDRESS,
  USDC_ADDRESS,
} from "../../config/arc.testnet";

export const AED_USD_PEG = 3.6725;
export const DEFAULT_STABLEFX_BASE_URL = "https://api-sandbox.circle.com";

export type StableFxStatus =
  | { status: "pending"; message: string }
  | { status: "configured"; message: string };

export type StableFxCurrency = "USDC" | "EURC";
export type StableFxTenor = "instant" | "hourly" | "daily";
export type StableFxQuoteType = "tradable" | "reference";

export interface CurrencyAmount {
  currency: StableFxCurrency;
  amount?: string;
}

export interface StableFxQuote {
  id: string;
  rate: string;
  from: { currency: string; amount: string };
  to: { currency: string; amount: string };
  fee: string;
  createdAt: string;
  expiresAt: string;
  typedData?: Record<string, unknown>;
  raw: Record<string, unknown>;
}

export interface StableFxTrade {
  id: string;
  quoteId: string;
  status: string;
  rate: string;
  from: { currency: string; amount: string };
  to: { currency: string; amount: string };
  fee?: string;
  contractTradeId?: string;
  settlementTransactionHash?: string;
  /** Present on get-trade detail — used to diagnose failed onchain funding. */
  contractTransactions?: {
    takerDeliver?: { status?: string; txHash?: string; errorDetails?: string | null };
    makerDeliver?: { status?: string; txHash?: string; errorDetails?: string | null };
  };
  raw: Record<string, unknown>;
}

/**
 * Terminal / funded states for the taker.
 * NOTE: `confirmed` is NOT success — it means "awaiting signatures / onchain record".
 * Treating it as success skipped /fund and left balances unchanged.
 */
const TAKER_FUNDED_STATUSES = ["taker_funded", "maker_funded", "complete", "completed"] as const;

/** Only fund once the trade is recorded onchain and awaiting delivery. */
const READY_TO_FUND_STATUSES = ["pending_settlement", ...TAKER_FUNDED_STATUSES] as const;

export const PERMIT2_ADDRESS =
  "0x000000000022D473030F116dDEE9F6B43aC78BA3" as const;


export interface RequestQuoteParams {
  from: CurrencyAmount;
  to: CurrencyAmount;
  tenor?: StableFxTenor;
  type?: StableFxQuoteType;
  recipientAddress: string;
}

export interface ExecuteTakerTradeParams {
  fromCurrency: StableFxCurrency;
  toCurrency: StableFxCurrency;
  fromAmount: string;
  /** Wallet that receives `to` currency and signs Permit2 (must hold `from` tokens). */
  recipientAddress?: string;
  /** Developer-controlled Circle wallet id for signTypedData (optional). */
  walletId?: string;
  tenor?: StableFxTenor;
  /** Force FACILITATOR_PRIVATE_KEY EIP-712 signing (Path B). */
  useEoaSigner?: boolean;
  timeoutMs?: number;
  pollIntervalMs?: number;
  /** Step-by-step progress for UI / server logs. */
  onProgress?: (event: StableFxProgressEvent) => void;
}

export interface StableFxProgressEvent {
  stage: string;
  message: string;
  elapsedMs: number;
  tradeId?: string;
  tradeStatus?: string;
  quoteId?: string;
  detail?: Record<string, unknown>;
}

export interface ExecuteTakerTradeResult {
  quote: StableFxQuote;
  trade: StableFxTrade;
  settlementTransactionHash?: string;
  fxSpreadBps: number;
  feeUsdc: string;
}

function getStableFxBaseUrl(): string {
  return (
    process.env.STABLEFX_API_BASE_URL?.replace(/\/$/, "") ||
    DEFAULT_STABLEFX_BASE_URL
  );
}

function getStableFxApiKey(): string {
  const { stableFxApiKey } = getCircleConfig();
  if (!stableFxApiKey?.trim()) {
    throw new Error(
      "CIRCLE_STABLEFX_API_KEY is required for StableFX. Set it from Circle sandbox access."
    );
  }
  return stableFxApiKey.trim();
}

async function stableFxFetch<T = unknown>(
  path: string,
  init?: RequestInit
): Promise<{ status: number; data: T }> {
  const url = `${getStableFxBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${getStableFxApiKey()}`,
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
    const errBody = parsed as {
      message?: string;
      code?: number;
      errors?: unknown;
      data?: unknown;
    };
    const detail =
      errBody?.message ??
      (errBody?.errors != null ? JSON.stringify(errBody.errors) : null) ??
      (text.slice(0, 400) || res.statusText);
    throw new Error(
      `StableFX ${init?.method ?? "GET"} ${path} failed (${res.status}): ${detail}`
    );
  }

  const envelope = parsed as { data?: T };
  const data = (envelope?.data !== undefined ? envelope.data : parsed) as T;
  return { status: res.status, data };
}

function normalizeFee(fee: unknown): string {
  if (fee == null) return "0";
  if (typeof fee === "string" || typeof fee === "number") return String(fee);
  if (typeof fee === "object" && fee !== null && "amount" in fee) {
    return String((fee as { amount: string | number }).amount ?? "0");
  }
  return "0";
}

function normalizeQuote(raw: Record<string, unknown>): StableFxQuote {
  const from = raw.from as { currency: string; amount: string };
  const to = raw.to as { currency: string; amount: string };
  return {
    id: String(raw.id),
    rate: String(raw.rate ?? "0"),
    from: { currency: from.currency, amount: String(from.amount) },
    to: { currency: to.currency, amount: String(to.amount) },
    fee: normalizeFee(raw.fee),
    createdAt: String(raw.createdAt ?? raw.createDate ?? raw.timestamp ?? ""),
    expiresAt: String(raw.expiresAt ?? raw.expiry ?? ""),
    typedData: raw.typedData as Record<string, unknown> | undefined,
    raw,
  };
}

function normalizeTrade(raw: Record<string, unknown>): StableFxTrade {
  const from = (raw.from ?? { currency: "USDC", amount: "0" }) as {
    currency: string;
    amount: string;
  };
  const to = (raw.to ?? { currency: "EURC", amount: "0" }) as {
    currency: string;
    amount: string;
  };
  const txs = raw.contractTransactions as StableFxTrade["contractTransactions"] | undefined;
  return {
    id: String(raw.id),
    quoteId: String(raw.quoteId ?? ""),
    status: String(raw.status ?? "unknown"),
    rate: String(raw.rate ?? "0"),
    from: { currency: from.currency, amount: String(from.amount) },
    to: { currency: to.currency, amount: String(to.amount) },
    fee: normalizeFee(raw.fee),
    contractTradeId:
      raw.contractTradeId != null ? String(raw.contractTradeId) : undefined,
    settlementTransactionHash:
      raw.settlementTransactionHash != null
        ? String(raw.settlementTransactionHash)
        : undefined,
    contractTransactions: txs,
    raw,
  };
}

function isSuccessStatus(status: string): boolean {
  return (TAKER_FUNDED_STATUSES as readonly string[]).includes(status.toLowerCase());
}

function isReadyToFundStatus(status: string): boolean {
  return (READY_TO_FUND_STATUSES as readonly string[]).includes(status.toLowerCase());
}

function tokenAddressForCurrency(currency: string): string {
  return currency.toUpperCase() === "EURC" ? EURC_ADDRESS : USDC_ADDRESS;
}

/**
 * StableFX /fund requires ERC-20 allowance from the taker wallet → Permit2.
 * Without this, createTrade succeeds but funding stays on pending_settlement forever.
 */
async function ensurePermit2Allowance(params: {
  currency: string;
  humanAmount: string;
  ownerAddress: string;
  onProgress?: (message: string) => void;
}): Promise<void> {
  const { getEthersWallet } = await import("./wallet-adapters");
  const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);
  const wallet = getEthersWallet("facilitator", provider);
  if (wallet.address.toLowerCase() !== params.ownerAddress.toLowerCase()) {
    throw new Error(
      `StableFX signer mismatch: EOA ${wallet.address} != trade address ${params.ownerAddress}`
    );
  }

  const token = tokenAddressForCurrency(params.currency);
  const erc20 = new ethers.Contract(
    token,
    [
      "function balanceOf(address) view returns (uint256)",
      "function allowance(address,address) view returns (uint256)",
      "function approve(address,uint256) returns (bool)",
      "function decimals() view returns (uint8)",
    ],
    wallet
  );

  const decimals = Number(await erc20.decimals());
  const needed = ethers.parseUnits(params.humanAmount, decimals);
  const balance: bigint = await erc20.balanceOf(wallet.address);
  if (balance < needed) {
    throw new Error(
      `Facilitator ${wallet.address} has insufficient ${params.currency} on Arc: ` +
        `have ${ethers.formatUnits(balance, decimals)}, need ${params.humanAmount}. ` +
        `Fund this EOA (FACILITATOR_PRIVATE_KEY) before Convert.`
    );
  }

  const allowance: bigint = await erc20.allowance(wallet.address, PERMIT2_ADDRESS);
  if (allowance >= needed) {
    params.onProgress?.(
      `Permit2 allowance ok (${ethers.formatUnits(allowance, decimals)} ${params.currency})`
    );
    return;
  }

  params.onProgress?.(
    `Approving Permit2 for ${params.currency} (current allowance ${ethers.formatUnits(allowance, decimals)})…`
  );
  const tx = await erc20.approve(PERMIT2_ADDRESS, ethers.MaxUint256);
  params.onProgress?.(`Permit2 approve tx ${tx.hash} — waiting…`);
  await tx.wait(1);
  params.onProgress?.("Permit2 approved");
}

/** Circle fund API expects string numeric fields on permit2. */
function normalizePermit2Message(
  message: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...message };
  if (out.nonce != null) out.nonce = String(out.nonce);
  if (out.deadline != null) out.deadline = String(out.deadline);
  if (out.spender != null) out.spender = String(out.spender);
  const permitted = out.permitted as Record<string, unknown> | undefined;
  if (permitted && typeof permitted === "object" && !Array.isArray(permitted)) {
    out.permitted = {
      ...permitted,
      token: permitted.token != null ? String(permitted.token) : permitted.token,
      amount: permitted.amount != null ? String(permitted.amount) : permitted.amount,
    };
  }
  const witness = out.witness as Record<string, unknown> | undefined;
  if (witness && typeof witness === "object") {
    out.witness = {
      ...witness,
      id: witness.id != null ? String(witness.id) : witness.id,
    };
  }
  return out;
}

/** AED (conceptual) → USDC notional using documented UAE peg. */
export function aedToUsdc(aedAmount: string | number): string {
  const aed = typeof aedAmount === "number" ? aedAmount : Number(aedAmount);
  if (!Number.isFinite(aed) || aed <= 0) {
    throw new Error("AED amount must be a positive number");
  }
  const usdc = aed / AED_USD_PEG;
  return usdc.toFixed(6).replace(/\.?0+$/, "") || "0";
}

/** Convert StableFX fee (in quote `to` or absolute USDC) into basis points vs notional. */
export function feeToSpreadBps(feeAmount: string, notionalUsdc: string): number {
  const fee = Number(feeAmount);
  const notional = Number(notionalUsdc);
  if (!Number.isFinite(fee) || !Number.isFinite(notional) || notional <= 0) return 0;
  return Math.max(0, Math.round((fee / notional) * 10_000));
}

export function checkStableFxAccess(): StableFxStatus {
  const key = process.env.CIRCLE_STABLEFX_API_KEY ?? "";
  if (!key.trim()) {
    return {
      status: "pending",
      message:
        "PENDING — StableFX API key not set. Obtain sandbox access from Circle and set CIRCLE_STABLEFX_API_KEY.",
    };
  }
  return {
    status: "configured",
    message: `StableFX API key present — base URL ${getStableFxBaseUrl()}`,
  };
}

export async function requestQuote(params: RequestQuoteParams): Promise<StableFxQuote> {
  const type = params.type ?? "tradable";
  const body: Record<string, unknown> = {
    from: params.from,
    to: params.to,
    tenor: params.tenor ?? "instant",
    type,
  };
  if (type === "tradable") {
    body.recipientAddress = params.recipientAddress;
  }

  const { data } = await stableFxFetch<Record<string, unknown>>(
    "/v1/exchange/stablefx/quotes",
    { method: "POST", body: JSON.stringify(body) }
  );
  return normalizeQuote(data);
}

/**
 * Accept a tradable quote. Circle requires the signed Permit2 message from the
 * quote's typedData (not quoteId alone) — see StableFX taker quickstart.
 */
export async function createTrade(params: {
  quoteId: string;
  address: string;
  message: Record<string, unknown>;
  signature: string;
  idempotencyKey?: string;
}): Promise<StableFxTrade> {
  const { data } = await stableFxFetch<Record<string, unknown>>(
    "/v1/exchange/stablefx/trades",
    {
      method: "POST",
      body: JSON.stringify({
        quoteId: params.quoteId,
        address: params.address,
        message: params.message,
        signature: params.signature,
        idempotencyKey: params.idempotencyKey ?? randomUUID(),
      }),
    }
  );
  return normalizeTrade(data);
}

export async function getTakerPresign(
  tradeId: string,
  recipientAddress: string
): Promise<Record<string, unknown>> {
  const q = new URLSearchParams({ recipientAddress });
  const { data } = await stableFxFetch<Record<string, unknown>>(
    `/v1/exchange/stablefx/signatures/presign/taker/${tradeId}?${q}`
  );
  const typedData =
    (data.typedData as Record<string, unknown> | undefined) ??
    (data as Record<string, unknown>);
  if (!typedData || typeof typedData !== "object") {
    throw new Error("StableFX taker presign missing typedData");
  }
  return typedData.domain ? typedData : (typedData.typedData as Record<string, unknown>) ?? typedData;
}

export async function submitSignature(body: Record<string, unknown>): Promise<void> {
  await stableFxFetch("/v1/exchange/stablefx/signatures", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function getFundingPresign(contractTradeIds: string[]): Promise<Record<string, unknown>> {
  const { data } = await stableFxFetch<Record<string, unknown>>(
    "/v1/exchange/stablefx/signatures/funding/presign",
    {
      method: "POST",
      body: JSON.stringify({ contractTradeIds, type: "taker" }),
    }
  );
  if (data.typedData) return data.typedData as Record<string, unknown>;
  return data;
}

export async function fundTrade(body: Record<string, unknown>): Promise<void> {
  await stableFxFetch("/v1/exchange/stablefx/fund", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function getTrade(
  tradeId: string,
  opts?: { type?: string; status?: string }
): Promise<StableFxTrade> {
  const q = new URLSearchParams();
  q.set("type", opts?.type ?? "taker");
  if (opts?.status) q.set("status", opts.status);
  const { data } = await stableFxFetch<Record<string, unknown> | Record<string, unknown>[]>(
    `/v1/exchange/stablefx/trades/${tradeId}?${q}`
  );
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error(`StableFX trade not found: ${tradeId}`);
  return normalizeTrade(row as Record<string, unknown>);
}

export async function waitForTradeStatus(
  tradeId: string,
  statuses: string[],
  opts?: {
    timeoutMs?: number;
    pollIntervalMs?: number;
    onPoll?: (trade: StableFxTrade, elapsedMs: number) => void;
  }
): Promise<StableFxTrade> {
  const timeoutMs = opts?.timeoutMs ?? 180_000;
  const pollIntervalMs = opts?.pollIntervalMs ?? 3_000;
  const wanted = new Set(statuses.map((s) => s.toLowerCase()));
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const trade = await getTrade(tradeId);
    const elapsedMs = Date.now() - started;
    opts?.onPoll?.(trade, elapsedMs);
    if (wanted.has(trade.status.toLowerCase())) return trade;
    if (["failed", "cancelled", "expired"].includes(trade.status.toLowerCase())) {
      throw new Error(`StableFX trade ${tradeId} ended with status ${trade.status}`);
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
  throw new Error(
    `StableFX trade ${tradeId} did not reach [${statuses.join(", ")}] within ${timeoutMs}ms`
  );
}

async function signTypedDataWithCircleWallet(
  walletId: string,
  typedData: Record<string, unknown>
): Promise<string> {
  const { getDeveloperClient } = await import("./developer-client");
  const client = getDeveloperClient();
  const response = await client.signTypedData({
    walletId,
    data: JSON.stringify(typedData),
  } as Parameters<typeof client.signTypedData>[0]);
  const signature =
    (response.data as { signature?: string } | undefined)?.signature ??
    (response as { data?: { data?: { signature?: string } } }).data?.data?.signature;
  if (!signature) {
    throw new Error("Circle signTypedData returned no signature");
  }
  return signature;
}

async function signTypedDataWithEoa(
  typedData: Record<string, unknown>
): Promise<string> {
  const { getEthersWallet } = await import("./wallet-adapters");
  const wallet = getEthersWallet("facilitator");
  const domain = typedData.domain as ethers.TypedDataDomain;
  const types = { ...(typedData.types as Record<string, Array<{ name: string; type: string }>>) };
  delete types.EIP712Domain;
  const message = typedData.message as Record<string, unknown>;
  return wallet.signTypedData(domain, types, message);
}

async function resolveTaker(params: {
  recipientAddress?: string;
  walletId?: string;
  useEoaSigner?: boolean;
}): Promise<{
  address: string;
  walletId?: string;
  useEoa: boolean;
}> {
  if (params.useEoaSigner === true) {
    const { getFacilitatorEoaAddress } = await import("./wallet-adapters");
    // Address in createTrade must match the EIP-712 signer (EOA key).
    return {
      address: getFacilitatorEoaAddress(),
      useEoa: true,
    };
  }

  if (params.recipientAddress && params.walletId) {
    return {
      address: params.recipientAddress,
      walletId: params.walletId,
      useEoa: false,
    };
  }

  if (params.recipientAddress && params.useEoaSigner !== false) {
    return { address: params.recipientAddress, useEoa: true };
  }

  const {
    getFacilitatorConfig,
    getFacilitatorWalletAddress,
    getFacilitatorEoaAddress,
  } = await import("./wallet-adapters");
  try {
    const { walletId } = getFacilitatorConfig();
    const address = params.recipientAddress ?? (await getFacilitatorWalletAddress());
    return { address, walletId, useEoa: false };
  } catch {
    const address = params.recipientAddress ?? getFacilitatorEoaAddress();
    return { address, useEoa: true };
  }
}

async function signTypedData(
  typedData: Record<string, unknown>,
  opts: { walletId?: string; useEoa: boolean }
): Promise<string> {
  if (!opts.useEoa && opts.walletId) {
    try {
      return await signTypedDataWithCircleWallet(opts.walletId, typedData);
    } catch (err) {
      console.warn(
        "[stablefx] Circle signTypedData failed, falling back to FACILITATOR_PRIVATE_KEY:",
        err instanceof Error ? err.message : err
      );
    }
  }
  return signTypedDataWithEoa(typedData);
}

/**
 * Full taker RFQ → settle against live StableFX sandbox/API.
 *
 * Current Circle flow (taker quickstart):
 * 1) tradable quote (includes typedData)
 * 2) sign quote typedData → POST /trades with address + message + signature
 * 3) funding presign → sign → POST /fund with permit2
 * 4) wait until taker_funded / completed
 */
export async function executeTakerTrade(
  params: ExecuteTakerTradeParams
): Promise<ExecuteTakerTradeResult> {
  const started = Date.now();
  const progress = (stage: string, message: string, extra?: Partial<StableFxProgressEvent>) => {
    const event: StableFxProgressEvent = {
      ...extra,
      stage,
      message,
      elapsedMs: Date.now() - started,
    };
    console.info(
      `[StableFX] ${stage} (+${event.elapsedMs}ms) ${message}`,
      extra?.detail ?? ""
    );
    params.onProgress?.(event);
  };

  progress("resolve_taker", "Resolving facilitator / signer address…");
  const taker = await resolveTaker({
    recipientAddress: params.recipientAddress,
    walletId: params.walletId,
    useEoaSigner: params.useEoaSigner,
  });
  const useEoa = params.useEoaSigner === true || taker.useEoa;
  const signOpts = { walletId: params.walletId ?? taker.walletId, useEoa };
  progress("resolve_taker", `Signer ${taker.address.slice(0, 10)}… (eoa=${useEoa})`, {
    detail: { address: taker.address, useEoa },
  });

  progress("quote", `Requesting live ${params.fromCurrency}→${params.toCurrency} quote…`);
  const quote = await requestQuote({
    from: { currency: params.fromCurrency, amount: params.fromAmount },
    to: { currency: params.toCurrency },
    tenor: params.tenor ?? "instant",
    type: "tradable",
    recipientAddress: taker.address,
  });
  progress("quote", `Got quote ${quote.id.slice(0, 8)}… rate ${quote.rate}`, {
    quoteId: quote.id,
    detail: { rate: quote.rate, fee: quote.fee, expiresAt: quote.expiresAt },
  });

  const typedData = quote.typedData;
  const quoteMessage = typedData?.message as Record<string, unknown> | undefined;
  if (!typedData || !quoteMessage) {
    throw new Error(
      `StableFX quote ${quote.id} missing typedData.message — request type=tradable`
    );
  }

  progress("sign_quote", "Signing Permit2 quote typedData…");
  const quoteSig = await signTypedData(typedData, signOpts);
  progress("sign_quote", "Quote signed");

  progress("permit2", "Checking facilitator balance + Permit2 allowance…");
  await ensurePermit2Allowance({
    currency: params.fromCurrency,
    humanAmount: params.fromAmount,
    ownerAddress: taker.address,
    onProgress: (message) => progress("permit2", message),
  });

  progress("create_trade", "POST /trades (accept quote)…");
  const trade = await createTrade({
    quoteId: quote.id,
    address: taker.address,
    message: quoteMessage,
    signature: quoteSig,
  });
  progress("create_trade", `Trade ${trade.id.slice(0, 8)}… status=${trade.status}`, {
    tradeId: trade.id,
    tradeStatus: trade.status,
    quoteId: quote.id,
    detail: { contractTradeId: trade.contractTradeId },
  });

  let current = trade;

  if (!isSuccessStatus(current.status)) {
    // pending → confirmed is normal; do NOT treat confirmed as funded.
    // Wait until pending_settlement (or already funded) before calling /fund.
    if (!isReadyToFundStatus(current.status) || !current.contractTradeId) {
      progress(
        "await_contract",
        `Waiting for pending_settlement (now ${current.status})…`
      );
      current = await waitForTradeStatus(
        trade.id,
        [...READY_TO_FUND_STATUSES],
        {
          timeoutMs: 90_000,
          pollIntervalMs: params.pollIntervalMs ?? 2_000,
          onPoll: (t) => {
            progress("await_contract", `Poll status=${t.status}`, {
              tradeId: t.id,
              tradeStatus: t.status,
              detail: { contractTradeId: t.contractTradeId },
            });
          },
        }
      );
    }

    if (!isSuccessStatus(current.status)) {
      const fresh = await getTrade(trade.id);
      current = fresh;
      const ctid = current.contractTradeId;
      if (!ctid) {
        throw new Error(
          `StableFX trade ${trade.id} is ${current.status} but missing contractTradeId — cannot fund`
        );
      }
      if (current.status.toLowerCase() !== "pending_settlement" && !isSuccessStatus(current.status)) {
        throw new Error(
          `StableFX trade ${trade.id} status=${current.status}; expected pending_settlement before /fund`
        );
      }

      progress("funding_presign", `Funding presign for contractTradeId=${ctid}…`);
      const fundingTyped = await getFundingPresign([ctid]);
      const fundingMessage = fundingTyped.message as Record<string, unknown> | undefined;
      if (!fundingMessage) {
        throw new Error("StableFX funding presign missing typedData.message");
      }

      const permit2 = normalizePermit2Message(fundingMessage);
      progress("sign_funding", "Signing funding Permit2…");
      const fundingSig = await signTypedData(fundingTyped, signOpts);

      progress("fund", "POST /fund (gross Permit2 delivery)…");
      await fundTrade({
        type: "taker",
        fundingMode: "gross",
        signature: fundingSig,
        permit2,
      });
      progress("fund", "Fund request accepted by Circle API");
    }
  }

  progress("wait_settlement", "Polling until taker_funded / complete…");
  let lastStatus = current.status;
  try {
    const settled = await waitForTradeStatus(
      trade.id,
      [...TAKER_FUNDED_STATUSES],
      {
        timeoutMs: params.timeoutMs ?? 120_000,
        pollIntervalMs: params.pollIntervalMs ?? 2_000,
        onPoll: (t) => {
          lastStatus = t.status;
          const deliver = t.contractTransactions?.takerDeliver;
          progress("wait_settlement", `Poll status=${t.status}`, {
            tradeId: t.id,
            tradeStatus: t.status,
            detail: {
              contractTradeId: t.contractTradeId,
              settlementTransactionHash: t.settlementTransactionHash,
              takerDeliver: deliver,
            },
          });
          if (deliver?.status === "failed") {
            throw new Error(
              `StableFX takerDeliver failed: ${deliver.errorDetails ?? "unknown onchain error"}. ` +
                `Check facilitator USDC balance and Permit2 allowance on Arc.`
            );
          }
        },
      }
    );

    const feeUsdc = quote.fee || settled.fee || "0";
    const fxSpreadBps = feeToSpreadBps(feeUsdc, params.fromAmount);

    progress("done", `Settled status=${settled.status}`, {
      tradeId: settled.id,
      tradeStatus: settled.status,
      quoteId: quote.id,
      detail: {
        settlementTransactionHash: settled.settlementTransactionHash,
        feeUsdc,
      },
    });

    return {
      quote,
      trade: settled,
      settlementTransactionHash: settled.settlementTransactionHash,
      fxSpreadBps,
      feeUsdc,
    };
  } catch (err: unknown) {
    const detail = await getTrade(trade.id).catch(() => null);
    const deliver = detail?.contractTransactions?.takerDeliver;
    const hint =
      lastStatus === "pending_settlement" || detail?.status === "pending_settlement"
        ? ` Trade stuck in pending_settlement — funding likely failed (balance/allowance). ` +
          `Facilitator must hold ${params.fromAmount} ${params.fromCurrency} and approve Permit2 ${PERMIT2_ADDRESS}.`
        : "";
    const deliverHint = deliver?.errorDetails
      ? ` takerDeliver: ${deliver.errorDetails}`
      : "";
    const base = err instanceof Error ? err.message : String(err);
    throw new Error(`${base}${hint}${deliverHint}`);
  }
}
