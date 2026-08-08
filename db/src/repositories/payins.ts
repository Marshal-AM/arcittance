import { getSupabaseClient } from "../client";

export type PayinRowStatus =
  | "created"
  | "pending"
  | "complete"
  | "expired"
  | "failed"
  | "active";

export interface PayinRow {
  id: string;
  payment_intent_id: string;
  sender_email: string | null;
  sender_user_id: string | null;
  amount: string | number;
  currency: string;
  status: PayinRowStatus;
  deposit_address: string | null;
  chain: string | null;
  merchant_wallet_id: string | null;
  received_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at?: string;
}

export async function createPayin(input: {
  payment_intent_id: string;
  amount: string | number;
  currency?: string;
  status?: PayinRowStatus;
  sender_email?: string;
  sender_user_id?: string;
  deposit_address?: string;
  chain?: string;
  merchant_wallet_id?: string;
  metadata?: Record<string, unknown>;
}): Promise<PayinRow> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("payins")
    .insert({
      payment_intent_id: input.payment_intent_id,
      amount: input.amount,
      currency: input.currency ?? "USD",
      status: input.status ?? "created",
      sender_email: input.sender_email ?? null,
      sender_user_id: input.sender_user_id ?? null,
      deposit_address: input.deposit_address ?? null,
      chain: input.chain ?? "ARC",
      merchant_wallet_id: input.merchant_wallet_id ?? null,
      metadata: input.metadata ?? {},
    })
    .select()
    .single();
  if (error) throw new Error(`createPayin failed: ${error.message}`);
  return data as PayinRow;
}

export async function getPayinById(id: string): Promise<PayinRow | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from("payins").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`getPayinById failed: ${error.message}`);
  return data as PayinRow | null;
}

export async function getPayinByIntentId(paymentIntentId: string): Promise<PayinRow | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("payins")
    .select("*")
    .eq("payment_intent_id", paymentIntentId)
    .maybeSingle();
  if (error) throw new Error(`getPayinByIntentId failed: ${error.message}`);
  return data as PayinRow | null;
}

export async function updatePayin(
  id: string,
  patch: Partial<{
    status: PayinRowStatus;
    deposit_address: string;
    received_at: string;
    metadata: Record<string, unknown>;
    merchant_wallet_id: string;
  }>
): Promise<PayinRow> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("payins")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(`updatePayin failed: ${error.message}`);
  return data as PayinRow;
}
