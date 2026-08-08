import { getSupabaseClient } from "../client";

export type ReceiptType = "single" | "batch";

export interface ReceiptRow {
  id: string;
  remittance_id: string | null;
  batch_id: string | null;
  attestation_hash: string;
  type: ReceiptType;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface CreateReceiptInput {
  attestation_hash: string;
  type: ReceiptType;
  remittance_id?: string;
  batch_id?: string;
  payload?: Record<string, unknown>;
}

export async function createReceipt(input: CreateReceiptInput): Promise<ReceiptRow> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("receipts")
    .insert({
      attestation_hash: input.attestation_hash,
      type: input.type,
      remittance_id: input.remittance_id ?? null,
      batch_id: input.batch_id ?? null,
      payload: input.payload ?? {},
    })
    .select()
    .single();

  if (error) throw new Error(`createReceipt failed: ${error.message}`);
  return data as ReceiptRow;
}
