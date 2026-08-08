import { getSupabaseClient } from "../client";

export interface PayoutRow {
  id: string;
  payout_id: string;
  recipient_id: string;
  remittance_id: string | null;
  amount: string | number;
  currency: string;
  status: string;
  chain: string | null;
  tx_hash: string | null;
  idempotency_key: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at?: string;
}

export async function createPayoutRow(input: {
  payout_id: string;
  recipient_id: string;
  amount: string | number;
  currency: string;
  status?: string;
  remittance_id?: string;
  chain?: string;
  tx_hash?: string;
  idempotency_key?: string;
  metadata?: Record<string, unknown>;
}): Promise<PayoutRow> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("payouts")
    .insert({
      payout_id: input.payout_id,
      recipient_id: input.recipient_id,
      amount: input.amount,
      currency: input.currency,
      status: input.status ?? "pending",
      remittance_id: input.remittance_id ?? null,
      chain: input.chain ?? null,
      tx_hash: input.tx_hash ?? null,
      idempotency_key: input.idempotency_key ?? null,
      metadata: input.metadata ?? {},
    })
    .select()
    .single();
  if (error) throw new Error(`createPayoutRow failed: ${error.message}`);
  return data as PayoutRow;
}

export async function getPayoutById(id: string): Promise<PayoutRow | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from("payouts").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`getPayoutById failed: ${error.message}`);
  return data as PayoutRow | null;
}

export async function getPayoutByCircleId(payoutId: string): Promise<PayoutRow | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("payouts")
    .select("*")
    .eq("payout_id", payoutId)
    .maybeSingle();
  if (error) throw new Error(`getPayoutByCircleId failed: ${error.message}`);
  return data as PayoutRow | null;
}

export async function updatePayoutRow(
  id: string,
  patch: Partial<{
    status: string;
    tx_hash: string;
    metadata: Record<string, unknown>;
  }>
): Promise<PayoutRow> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("payouts")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(`updatePayoutRow failed: ${error.message}`);
  return data as PayoutRow;
}
