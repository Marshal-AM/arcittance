/**
 * User-controlled Circle Wallets — REST API client for consumer remittance.
 */

import { randomUUID } from "crypto";
import { getCircleConfig } from "./config";

const CIRCLE_API_BASE = "https://api.circle.com";
const ARC_BLOCKCHAIN = "ARC-TESTNET";
const ARC_USDC_ADDRESS = "0x3600000000000000000000000000000000000000";
const ARC_EURC_ADDRESS = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";

async function circleFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const { apiKey } = getCircleConfig();
  return fetch(`${CIRCLE_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization:  `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

export interface UserSession {
  userId: string;
  userToken: string;
  encryptionKey: string;
}

export async function createUser(email: string): Promise<{ userId: string }> {
  const res = await circleFetch("/v1/w3s/users", {
    method: "POST",
    body: JSON.stringify({ userId: randomUUID() }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Circle create user failed (${res.status}): ${body}`);
  }
  const json = (await res.json()) as { data?: { user?: { id?: string }; id?: string } };
  const userId = json.data?.user?.id ?? json.data?.id;
  if (!userId) throw new Error("Circle create user: missing user id");
  return { userId };
}

/** PIN-auth users: server-side token without email OTP (Circle test / dev flow). */
export async function acquireUserTokenPin(userId: string): Promise<UserSession> {
  const res = await circleFetch("/v1/w3s/users/token", {
    method: "POST",
    body: JSON.stringify({ userId }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Circle PIN user token failed (${res.status}): ${body}`);
  }
  const json = (await res.json()) as {
    data?: { userToken?: string; encryptionKey?: string };
  };
  const userToken = json.data?.userToken;
  const encryptionKey = json.data?.encryptionKey;
  if (!userToken || !encryptionKey) {
    throw new Error("Circle PIN user token: unexpected response shape");
  }
  return { userId, userToken, encryptionKey };
}

export async function listUserWallets(
  userToken: string
): Promise<{ walletId: string; address: string }[]> {
  const res = await circleFetch("/v1/w3s/wallets", {
    headers: { "X-User-Token": userToken },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Circle list user wallets failed (${res.status}): ${body}`);
  }
  const json = (await res.json()) as {
    data?: { wallets?: { id: string; address: string }[] };
  };
  return (json.data?.wallets ?? []).map((w) => ({
    walletId:  w.id,
    address:   w.address,
  }));
}

/** Email OTP flow — request OTP (user completes verification in /remit UI). */
export async function requestEmailOtp(
  email: string,
  deviceId: string
): Promise<{ deviceToken: string; deviceEncryptionKey: string; otpToken: string }> {
  const res = await circleFetch("/v1/w3s/users/email/token", {
    method: "POST",
    body: JSON.stringify({
      idempotencyKey: randomUUID(),
      email,
      deviceId,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Circle email OTP request failed (${res.status}): ${body}`);
  }
  const json = (await res.json()) as {
    data?: {
      deviceToken?: string;
      deviceEncryptionKey?: string;
      otpToken?: string;
    };
  };
  const { deviceToken, deviceEncryptionKey, otpToken } = json.data ?? {};
  if (!deviceToken || !deviceEncryptionKey || !otpToken) {
    throw new Error("Circle email OTP: unexpected response shape");
  }
  return { deviceToken, deviceEncryptionKey, otpToken };
}

export async function initializeUserWalletChallenge(
  userToken: string,
  blockchains: string[] = ["ARC-TESTNET"]
): Promise<{ challengeId?: string; alreadyHasWallets: boolean }> {
  const res = await circleFetch("/v1/w3s/user/initialize", {
    method: "POST",
    headers: { "X-User-Token": userToken },
    body: JSON.stringify({
      idempotencyKey: randomUUID(),
      blockchains,
      accountType:    "SCA",
    }),
  });

  const json = (await res.json()) as {
    code?: number;
    message?: string;
    data?: { challengeId?: string };
  };

  // User already has wallet(s) — load via listUserWallets instead.
  if (json.code === 155106) {
    return { alreadyHasWallets: true };
  }

  if (!res.ok) {
    throw new Error(
      `Circle initialize user failed (${res.status}): ${JSON.stringify(json)}`
    );
  }

  const challengeId = json.data?.challengeId;
  if (!challengeId) {
    throw new Error("Circle initialize user: missing challengeId");
  }

  return { challengeId, alreadyHasWallets: false };
}

function decodeUserIdFromJwt(userToken: string): string | undefined {
  try {
    const segment = userToken.split(".")[1];
    if (!segment) return undefined;
    const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(
      Buffer.from(normalized, "base64").toString("utf8")
    ) as { sub?: string };
    return payload.sub;
  } catch {
    return undefined;
  }
}

export async function getUserIdFromToken(userToken: string): Promise<string> {
  const fromJwt = decodeUserIdFromJwt(userToken);

  const res = await circleFetch("/v1/w3s/user", {
    headers: { "X-User-Token": userToken },
  });

  if (res.ok) {
    const json = (await res.json()) as {
      data?: { id?: string; user?: { id?: string } };
    };
    const userId = json.data?.id ?? json.data?.user?.id;
    if (userId) return userId;
  }

  if (fromJwt) return fromJwt;

  const body = await res.text();
  throw new Error(`Circle get user failed (${res.status}): ${body}`);
}

export async function listUserWalletsWithRetry(
  userToken: string,
  attempts = 6,
  delayMs = 2000
): Promise<{ walletId: string; address: string }[]> {
  let last: { walletId: string; address: string }[] = [];
  for (let i = 0; i < attempts; i++) {
    last = await listUserWallets(userToken);
    if (last.length > 0) return last;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return last;
}

export async function acquireUserToken(userId: string, otp: string): Promise<UserSession> {
  const res = await circleFetch("/v1/w3s/users/token", {
    method: "POST",
    body: JSON.stringify({
      userId,
      otp,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Circle user token failed (${res.status}): ${body}`);
  }
  const json = (await res.json()) as {
    data?: { userToken?: string; encryptionKey?: string };
  };
  const userToken = json.data?.userToken;
  const encryptionKey = json.data?.encryptionKey;
  if (!userToken || !encryptionKey) {
    throw new Error("Circle user token: unexpected response shape");
  }
  return { userId, userToken, encryptionKey };
}

export async function createUserWallet(
  userToken: string,
  blockchains: string[] = ["ARC-TESTNET"]
): Promise<{ walletId: string; address: string }> {
  const res = await circleFetch("/v1/w3s/user/wallets", {
    method: "POST",
    headers: { "X-User-Token": userToken },
    body: JSON.stringify({
      idempotencyKey: randomUUID(),
      blockchains,
      accountType:    "SCA",
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Circle create user wallet failed (${res.status}): ${body}`);
  }
  const json = (await res.json()) as {
    data?: { wallets?: { id: string; address: string }[] };
  };
  const wallet = json.data?.wallets?.[0];
  if (!wallet?.id || !wallet?.address) {
    throw new Error("Circle create user wallet: unexpected response shape");
  }
  return { walletId: wallet.id, address: wallet.address };
}

export type RemitTokenSymbol = "USDC" | "EURC";

export async function resolveUserTokenId(
  userToken: string,
  walletId: string,
  symbol: RemitTokenSymbol = "USDC"
): Promise<string> {
  const res = await circleFetch(`/v1/w3s/wallets/${walletId}/balances`, {
    headers: { "X-User-Token": userToken },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Circle wallet balances failed (${res.status}): ${body}`);
  }

  const json = (await res.json()) as {
    data?: {
      tokenBalances?: {
        token?: {
          id?: string;
          symbol?: string;
          decimals?: number;
          tokenAddress?: string;
        };
      }[];
    };
  };

  const balances = json.data?.tokenBalances ?? [];
  const preferred =
    symbol === "EURC" ? ARC_EURC_ADDRESS.toLowerCase() : ARC_USDC_ADDRESS.toLowerCase();

  const exact = balances.find((entry) => {
    const token = entry.token;
    return (
      token?.symbol?.toUpperCase() === symbol &&
      token.decimals === 6 &&
      token.tokenAddress?.toLowerCase() === preferred
    );
  });
  if (exact?.token?.id) return exact.token.id;

  const anySymbol = balances.find(
    (entry) => entry.token?.symbol?.toUpperCase() === symbol
  );
  if (anySymbol?.token?.id) return anySymbol.token.id;

  throw new Error(`Circle wallet balances: ${symbol} token id not found`);
}

/** @deprecated Use resolveUserTokenId(..., "USDC") */
export async function resolveUserUsdcTokenId(
  userToken: string,
  walletId: string
): Promise<string> {
  return resolveUserTokenId(userToken, walletId, "USDC");
}

export interface WalletTokenBalances {
  walletId: string;
  usdc: string;
  eurc: string;
  tokens: Array<{ symbol: string; amount: string; tokenAddress?: string }>;
}

/** Read live USDC/EURC balances for a user-controlled wallet (Path A funding). */
export async function getWalletBalance(
  userToken: string,
  walletId: string
): Promise<WalletTokenBalances> {
  const res = await circleFetch(`/v1/w3s/wallets/${walletId}/balances`, {
    headers: { "X-User-Token": userToken },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Circle wallet balances failed (${res.status}): ${body}`);
  }

  const json = (await res.json()) as {
    data?: {
      tokenBalances?: Array<{
        amount?: string;
        token?: { symbol?: string; tokenAddress?: string };
      }>;
    };
  };

  const rows = json.data?.tokenBalances ?? [];
  const tokens = rows.map((entry) => ({
    symbol: entry.token?.symbol ?? "UNKNOWN",
    amount: entry.amount ?? "0",
    tokenAddress: entry.token?.tokenAddress,
  }));

  const find = (symbol: string) =>
    tokens.find((t) => t.symbol.toUpperCase() === symbol)?.amount ?? "0";

  return {
    walletId,
    usdc: find("USDC"),
    eurc: find("EURC"),
    tokens,
  };
}

/** Step 1 of user transfer — returns challengeId for Web SDK execute(). */
export async function createUserTransferChallenge(params: {
  userToken: string;
  walletId: string;
  destinationAddress: string;
  /** Human decimal amount (e.g. "0.1") — Circle API format, not micro units */
  amountUsdc: string;
  /** Token to send; default USDC. EURC is Arc same-chain only in Path A. */
  currency?: RemitTokenSymbol;
}): Promise<{ challengeId: string }> {
  const currency = params.currency ?? "USDC";
  const tokenId = await resolveUserTokenId(
    params.userToken,
    params.walletId,
    currency
  );

  const res = await circleFetch("/v1/w3s/user/transactions/transfer", {
    method: "POST",
    headers: { "X-User-Token": params.userToken },
    body: JSON.stringify({
      idempotencyKey:     randomUUID(),
      walletId:           params.walletId,
      destinationAddress: params.destinationAddress,
      amounts:            [params.amountUsdc],
      tokenId,
      feeLevel:           "MEDIUM",
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Circle user transfer challenge failed (${res.status}): ${body}`);
  }

  const json = (await res.json()) as { data?: { challengeId?: string } };
  const challengeId = json.data?.challengeId;
  if (!challengeId) {
    throw new Error("Circle user transfer challenge: missing challengeId");
  }
  return { challengeId };
}

export async function getUserTransaction(
  transactionId: string
): Promise<{ id: string; state: string; txHash?: string }> {
  const res = await circleFetch(`/v1/w3s/transactions/${transactionId}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Circle get transaction failed (${res.status}): ${body}`);
  }
  const json = (await res.json()) as {
    data?: { transaction?: { id?: string; state?: string; txHash?: string } };
  };
  const tx = json.data?.transaction;
  if (!tx?.id || !tx.state) {
    throw new Error("Circle get transaction: unexpected response shape");
  }
  return { id: tx.id, state: tx.state, txHash: tx.txHash };
}

export async function waitForOutboundTransfer(params: {
  walletId: string;
  destinationAddress: string;
  amountMicro: string;
  timeoutMs?: number;
}): Promise<{ transactionId: string; state: string; txHash?: string }> {
  const deadline = Date.now() + (params.timeoutMs ?? 120_000);
  const amountHuman = (Number(params.amountMicro) / 1_000_000).toString();
  const dest = params.destinationAddress.toLowerCase();
  const terminal = new Set(["COMPLETE", "CONFIRMED", "FAILED", "CANCELLED", "DENIED"]);

  while (Date.now() < deadline) {
    const res = await circleFetch(
      `/v1/w3s/transactions?walletIds=${encodeURIComponent(params.walletId)}&pageSize=10`
    );
    if (res.ok) {
      const json = (await res.json()) as {
        data?: {
          transactions?: {
            id: string;
            state: string;
            txHash?: string;
            transactionType?: string;
            destinationAddress?: string;
            amounts?: string[];
          }[];
        };
      };

      const match = (json.data?.transactions ?? []).find((tx) => {
        if (tx.transactionType !== "OUTBOUND") return false;
        if (tx.destinationAddress?.toLowerCase() !== dest) return false;
        const amt = tx.amounts?.[0];
        return amt === amountHuman || amt === params.amountMicro;
      });

      if (match && terminal.has(match.state)) {
        if (match.state === "FAILED" || match.state === "CANCELLED" || match.state === "DENIED") {
          throw new Error(`User transfer ${match.state}`);
        }
        return { transactionId: match.id, state: match.state, txHash: match.txHash };
      }

      if (match) {
        return { transactionId: match.id, state: match.state, txHash: match.txHash };
      }
    }

    await new Promise((r) => setTimeout(r, 3_000));
  }

  throw new Error("Timed out waiting for user wallet transfer to complete");
}

/** @deprecated Use createUserTransferChallenge + Web SDK execute + waitForOutboundTransfer */
export async function initiateUserTransfer(params: {
  userToken: string;
  walletId: string;
  destinationAddress: string;
  amountUsdc: string;
}): Promise<{ transactionId: string; state: string; challengeId: string }> {
  const { challengeId } = await createUserTransferChallenge(params);
  throw new Error(
    `User transfer requires Web SDK authorization (challengeId=${challengeId}). ` +
      "Complete the challenge in /remit, then call the bridge step."
  );
}

/** Resolve a Circle Wallets handle (email or @alias) to an on-chain address. */
export async function resolveUserHandle(handle: string): Promise<{ address: string }> {
  const trimmed = handle.trim().replace(/^@/, "");

  if (trimmed.includes("@")) {
    const res = await circleFetch(`/v1/w3s/users?email=${encodeURIComponent(trimmed)}`);
    if (res.ok) {
      const json = (await res.json()) as {
        data?: { users?: { id: string }[] };
      };
      const userId = json.data?.users?.[0]?.id;
      if (userId) {
        const walletRes = await circleFetch(`/v1/w3s/wallets?userId=${encodeURIComponent(userId)}`);
        if (walletRes.ok) {
          const walletJson = (await walletRes.json()) as {
            data?: { wallets?: { address: string }[] };
          };
          const address = walletJson.data?.wallets?.[0]?.address;
          if (address) return { address };
        }
      }
    }
  }

  if (/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
    return { address: trimmed };
  }

  throw new Error(`Could not resolve handle: ${handle}`);
}
