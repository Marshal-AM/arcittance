import { getSupabaseClient } from "../client";

export type MintLedgerStatus = "pending" | "deposited" | "minted" | "spent" | "failed";

export interface MintLedgerRow {
  id: string;
  sender_user_id: string;
  amount: string | number;
  currency: string;
  bank_account_id: string | null;
  deposit_id: string | null;
  transfer_id: string | null;
  recipient_address_id: string | null;
  mint_tx_hash: string | null;
  status: MintLedgerStatus;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at?: string;
}

export async function createMintLedgerEntry(input: {
  sender_user_id: string;
  amount: string | number;
  currency?: string;
  bank_account_id?: string;
  status?: MintLedgerStatus;
  metadata?: Record<string, unknown>;
}): Promise<MintLedgerRow> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("mint_ledger")
    .insert({
      sender_user_id: input.sender_user_id,
      amount: input.amount,
      currency: input.currency ?? "USD",
      bank_account_id: input.bank_account_id ?? null,
      status: input.status ?? "pending",
      metadata: input.metadata ?? {},
    })
    .select()
    .single();
  if (error) throw new Error(`createMintLedgerEntry failed: ${error.message}`);
  return data as MintLedgerRow;
}

export async function updateMintLedger(
  id: string,
  patch: Partial<{
    status: MintLedgerStatus;
    bank_account_id: string;
    deposit_id: string;
    transfer_id: string;
    recipient_address_id: string;
    mint_tx_hash: string;
    metadata: Record<string, unknown>;
  }>
): Promise<MintLedgerRow> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("mint_ledger")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(`updateMintLedger failed: ${error.message}`);
  return data as MintLedgerRow;
}

export async function getMintLedgerById(id: string): Promise<MintLedgerRow | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("mint_ledger")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getMintLedgerById failed: ${error.message}`);
  return data as MintLedgerRow | null;
}

export async function listMintLedgerForUser(
  userId: string,
  limit = 20
): Promise<MintLedgerRow[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("mint_ledger")
    .select("*")
    .eq("sender_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listMintLedgerForUser failed: ${error.message}`);
  return (data ?? []) as MintLedgerRow[];
}

/** Sum of minted-not-spent ledger amounts for a user. */
export async function getAvailableLedgerBalanceUsdc(userId: string): Promise<string> {
  const rows = await listMintLedgerForUser(userId, 100);
  let sum = 0;
  for (const row of rows) {
    if (row.status === "minted") sum += Number(row.amount);
  }
  return sum.toFixed(2);
}
