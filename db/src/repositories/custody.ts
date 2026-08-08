import { getSupabaseClient } from "../client";

export interface CustodyWalletRow {
  id: string;
  user_id: string;
  sub_wallet_id: string;
  address: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at?: string;
}

export async function upsertCustodyWallet(input: {
  user_id: string;
  sub_wallet_id: string;
  address?: string;
  metadata?: Record<string, unknown>;
}): Promise<CustodyWalletRow> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("custody_wallets")
    .upsert(
      {
        user_id: input.user_id,
        sub_wallet_id: input.sub_wallet_id,
        address: input.address ?? null,
        metadata: input.metadata ?? {},
      },
      { onConflict: "user_id" }
    )
    .select()
    .single();
  if (error) throw new Error(`upsertCustodyWallet failed: ${error.message}`);
  return data as CustodyWalletRow;
}

export async function getCustodyWalletByUserId(
  userId: string
): Promise<CustodyWalletRow | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("custody_wallets")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`getCustodyWalletByUserId failed: ${error.message}`);
  return data as CustodyWalletRow | null;
}
