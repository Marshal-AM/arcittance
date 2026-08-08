import { getSupabaseClient } from "../client";

const DEFAULT_CHAIN_ID = 5042002;

export interface MilestoneMetadataRow {
  id: string;
  chain_id: number;
  milestone_id: number;
  title: string;
  description: string;
  creator_address: string | null;
  tx_hash: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionPlanMetadataRow {
  id: string;
  chain_id: number;
  plan_id: number;
  title: string;
  description: string;
  creator_address: string | null;
  tx_hash: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpsertMilestoneMetadataInput {
  milestone_id: number | string;
  title: string;
  description?: string;
  creator_address?: string;
  tx_hash?: string;
  chain_id?: number;
}

export interface UpsertSubscriptionPlanMetadataInput {
  plan_id: number | string;
  title: string;
  description?: string;
  creator_address?: string;
  tx_hash?: string;
  chain_id?: number;
}

export async function upsertMilestoneMetadata(
  input: UpsertMilestoneMetadataInput
): Promise<MilestoneMetadataRow> {
  const supabase = getSupabaseClient();
  const chainId = input.chain_id ?? DEFAULT_CHAIN_ID;
  const title = input.title.trim();
  if (!title) throw new Error("title is required");

  const { data, error } = await supabase
    .from("milestone_metadata")
    .upsert(
      {
        chain_id: chainId,
        milestone_id: Number(input.milestone_id),
        title,
        description: (input.description ?? "").trim(),
        creator_address: input.creator_address?.toLowerCase() ?? null,
        tx_hash: input.tx_hash ?? null,
      },
      { onConflict: "chain_id,milestone_id" }
    )
    .select()
    .single();

  if (error) throw new Error(`upsertMilestoneMetadata failed: ${error.message}`);
  return data as MilestoneMetadataRow;
}

export async function listMilestoneMetadata(
  chainId = DEFAULT_CHAIN_ID
): Promise<MilestoneMetadataRow[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("milestone_metadata")
    .select("*")
    .eq("chain_id", chainId);

  if (error) throw new Error(`listMilestoneMetadata failed: ${error.message}`);
  return (data ?? []) as MilestoneMetadataRow[];
}

export async function upsertSubscriptionPlanMetadata(
  input: UpsertSubscriptionPlanMetadataInput
): Promise<SubscriptionPlanMetadataRow> {
  const supabase = getSupabaseClient();
  const chainId = input.chain_id ?? DEFAULT_CHAIN_ID;
  const title = input.title.trim();
  if (!title) throw new Error("title is required");

  const { data, error } = await supabase
    .from("subscription_plan_metadata")
    .upsert(
      {
        chain_id: chainId,
        plan_id: Number(input.plan_id),
        title,
        description: (input.description ?? "").trim(),
        creator_address: input.creator_address?.toLowerCase() ?? null,
        tx_hash: input.tx_hash ?? null,
      },
      { onConflict: "chain_id,plan_id" }
    )
    .select()
    .single();

  if (error) {
    throw new Error(`upsertSubscriptionPlanMetadata failed: ${error.message}`);
  }
  return data as SubscriptionPlanMetadataRow;
}

export async function listSubscriptionPlanMetadata(
  chainId = DEFAULT_CHAIN_ID
): Promise<SubscriptionPlanMetadataRow[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("subscription_plan_metadata")
    .select("*")
    .eq("chain_id", chainId);

  if (error) {
    throw new Error(`listSubscriptionPlanMetadata failed: ${error.message}`);
  }
  return (data ?? []) as SubscriptionPlanMetadataRow[];
}
