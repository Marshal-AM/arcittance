/**
 * Circle Mint custody — merchant / first-party wallet balances for remit funding.
 * Maps each remittance userId to the sandbox payments wallet (and optional metadata).
 */
import { mintFetch } from "./mint-http";

export interface MintWallet {
  walletId: string;
  entityId?: string;
  type?: string;
  purpose?: string;
  status?: string;
  description?: string;
  balances?: Array<{ amount?: string; currency?: string }>;
  createDate?: string;
  raw: Record<string, unknown>;
}

export interface CustodyBalance {
  walletId: string;
  availableUsdc: string;
  availableEurc: string;
  available: Array<{ amount: string; currency: string }>;
  unsettled: Array<{ amount: string; currency: string }>;
}

function asMoneyList(raw: unknown): Array<{ amount: string; currency: string }> {
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => {
    const row = x as { amount?: string; currency?: string };
    return { amount: String(row.amount ?? "0"), currency: String(row.currency ?? "") };
  });
}

export async function listWallets(pageSize = 50): Promise<MintWallet[]> {
  const { data } = await mintFetch<Array<Record<string, unknown>>>(
    `/v1/wallets?pageSize=${pageSize}`
  );
  const rows = Array.isArray(data) ? data : [];
  return rows.map((raw) => ({
    walletId: String(raw.walletId ?? raw.id),
    entityId: raw.entityId != null ? String(raw.entityId) : undefined,
    type: raw.type as string | undefined,
    purpose: raw.purpose as string | undefined,
    status: raw.status as string | undefined,
    description: raw.description as string | undefined,
    balances: raw.balances as MintWallet["balances"],
    createDate: raw.createDate as string | undefined,
    raw,
  }));
}

/** Primary payments wallet used for remit custody in sandbox. */
export async function getPrimaryCustodyWallet(): Promise<MintWallet> {
  const wallets = await listWallets();
  const payments = wallets.find(
    (w) => w.purpose === "payments" || w.type === "first_party" || w.status === "active"
  );
  if (!payments && wallets[0]) return wallets[0];
  if (!payments) {
    throw new Error("No Circle Mint custody wallet found for this sandbox account");
  }
  return payments;
}

export async function getBusinessBalances(): Promise<{
  available: Array<{ amount: string; currency: string }>;
  unsettled: Array<{ amount: string; currency: string }>;
}> {
  try {
    const { data } = await mintFetch<Record<string, unknown>>("/v1/businessAccount/balances");
    return {
      available: asMoneyList(data.available),
      unsettled: asMoneyList(data.unsettled),
    };
  } catch {
    const { data } = await mintFetch<Record<string, unknown>>("/v1/balances");
    return {
      available: asMoneyList(data.available),
      unsettled: asMoneyList(data.unsettled),
    };
  }
}

export async function getSubWalletBalance(_subWalletId?: string): Promise<CustodyBalance> {
  const wallet = await getPrimaryCustodyWallet();
  const balances = await getBusinessBalances();

  const find = (list: Array<{ amount: string; currency: string }>, ccy: string) =>
    list.find((b) => b.currency.toUpperCase() === ccy)?.amount ?? "0";

  // Prefer wallet-level balances when present; else business account.
  const fromWallet = asMoneyList(wallet.balances);
  const available = fromWallet.length > 0 ? fromWallet : balances.available;

  return {
    walletId: wallet.walletId,
    availableUsdc: find(available, "USD") !== "0" ? find(available, "USD") : find(available, "USDC"),
    availableEurc: find(available, "EURC") !== "0" ? find(available, "EURC") : find(available, "EUR"),
    available,
    unsettled: balances.unsettled,
  };
}

/**
 * Provision / resolve custody mapping for a remittance user.
 * Sandbox uses the shared first-party payments wallet; we persist the mapping in DB.
 */
export async function ensureCustodyWalletForUser(userId: string): Promise<{
  userId: string;
  subWalletId: string;
  wallet: MintWallet;
}> {
  if (!userId) throw new Error("userId is required for custody mapping");
  const wallet = await getPrimaryCustodyWallet();
  return { userId, subWalletId: wallet.walletId, wallet };
}
