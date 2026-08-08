import { getSupabaseClient } from "../client";

export type RemittanceStatus = "pending" | "settled" | "failed";

export interface RemittanceRow {
  id: string;
  on_chain_id: number | null;
  sender_address: string;
  recipient_address: string;
  amount: string;
  fee: string;
  destination_chain_id: number | null;
  routing_method: number | null;
  status: RemittanceStatus;
  tx_hash: string | null;
  attestation_hash: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateRemittanceInput {
  sender_address: string;
  recipient_address: string;
  amount: string | number | bigint;
  fee?: string | number | bigint;
  destination_chain_id?: number;
  routing_method?: number;
  on_chain_id?: number;
  tx_hash?: string;
  attestation_hash?: string;
  status?: RemittanceStatus;
}

export async function createRemittance(
  input: CreateRemittanceInput
): Promise<RemittanceRow> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("remittances")
    .insert({
      sender_address: input.sender_address,
      recipient_address: input.recipient_address,
      amount: String(input.amount),
      fee: input.fee != null ? String(input.fee) : "0",
      destination_chain_id: input.destination_chain_id ?? null,
      routing_method: input.routing_method ?? null,
      on_chain_id: input.on_chain_id ?? null,
      tx_hash: input.tx_hash ?? null,
      attestation_hash: input.attestation_hash ?? null,
      status: input.status ?? "pending",
    })
    .select()
    .single();

  if (error) throw new Error(`createRemittance failed: ${error.message}`);
  return data as RemittanceRow;
}

export async function listRemittances(limit = 50): Promise<RemittanceRow[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("remittances")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`listRemittances failed: ${error.message}`);
  return (data ?? []) as RemittanceRow[];
}

export async function getRemittanceById(id: string): Promise<RemittanceRow | null> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("remittances")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`getRemittanceById failed: ${error.message}`);
  return (data as RemittanceRow | null) ?? null;
}

export async function updateRemittanceStatus(
  id: string,
  status: RemittanceStatus,
  txHash?: string
): Promise<RemittanceRow> {
  const supabase = getSupabaseClient();

  const patch: Record<string, string> = { status };
  if (txHash !== undefined) patch.tx_hash = txHash;

  const { data, error } = await supabase
    .from("remittances")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(`updateRemittanceStatus failed: ${error.message}`);
  return data as RemittanceRow;
}
