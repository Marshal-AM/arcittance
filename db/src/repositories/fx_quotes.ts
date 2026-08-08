import { getSupabaseClient } from "../client";

export type FxQuoteStatus =
  | "quoted"
  | "executed"
  | "settled"
  | "expired"
  | "failed";

export interface FxQuoteRow {
  id: string;
  pair: string;
  quote_amount: string | number | null;
  rate: string | number | null;
  spread: string | number | null;
  maker: string | null;
  status: FxQuoteStatus;
  expires_at: string | null;
  stablefx_quote_id: string | null;
  stablefx_trade_id: string | null;
  remittance_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at?: string;
}

export interface CreateFxQuoteInput {
  pair: string;
  quote_amount: string | number;
  rate: string | number;
  spread?: string | number;
  maker?: string;
  status?: FxQuoteStatus;
  expires_at?: string | null;
  stablefx_quote_id?: string;
  stablefx_trade_id?: string;
  remittance_id?: string;
  metadata?: Record<string, unknown>;
}

function normalizeRow(data: Record<string, unknown>): FxQuoteRow {
  const meta = (data.metadata ?? {}) as Record<string, unknown>;
  return {
    id: String(data.id),
    pair: String(data.pair),
    quote_amount: (data.quote_amount as string | number | null) ?? null,
    rate: (data.rate as string | number | null) ?? null,
    spread: (data.spread as string | number | null) ?? (meta.spread as string | number | null) ?? null,
    maker: (data.maker as string | null) ?? (meta.maker as string | null) ?? null,
    status: (data.status as FxQuoteStatus | undefined)
      ?? (meta.status as FxQuoteStatus | undefined)
      ?? "quoted",
    expires_at: (data.expires_at as string | null) ?? null,
    stablefx_quote_id:
      (data.stablefx_quote_id as string | null)
      ?? (meta.stablefx_quote_id as string | null)
      ?? null,
    stablefx_trade_id:
      (data.stablefx_trade_id as string | null)
      ?? (meta.stablefx_trade_id as string | null)
      ?? null,
    remittance_id:
      (data.remittance_id as string | null)
      ?? (meta.remittance_id as string | null)
      ?? null,
    metadata: meta,
    created_at: String(data.created_at),
    updated_at: data.updated_at ? String(data.updated_at) : undefined,
  };
}

export async function createFxQuote(input: CreateFxQuoteInput): Promise<FxQuoteRow> {
  const supabase = getSupabaseClient();
  const status = input.status ?? "quoted";
  const maker = input.maker ?? "circle-stablefx";
  const metadata = {
    ...(input.metadata ?? {}),
    status,
    maker,
    spread: input.spread ?? null,
    stablefx_quote_id: input.stablefx_quote_id ?? null,
    stablefx_trade_id: input.stablefx_trade_id ?? null,
    remittance_id: input.remittance_id ?? null,
  };

  // Prefer Phase 10 columns (migration 002); fall back to stub schema + metadata.
  const fullInsert = {
    pair: input.pair,
    quote_amount: input.quote_amount,
    rate: input.rate,
    spread: input.spread ?? null,
    maker,
    status,
    expires_at: input.expires_at ?? null,
    stablefx_quote_id: input.stablefx_quote_id ?? null,
    stablefx_trade_id: input.stablefx_trade_id ?? null,
    remittance_id: input.remittance_id ?? null,
    metadata,
  };

  const full = await supabase.from("fx_quotes").insert(fullInsert).select().single();
  if (!full.error && full.data) {
    return normalizeRow(full.data as Record<string, unknown>);
  }

  const stubInsert = {
    pair: input.pair,
    quote_amount: input.quote_amount,
    rate: input.rate,
    expires_at: input.expires_at ?? null,
    metadata,
  };
  const stub = await supabase.from("fx_quotes").insert(stubInsert).select().single();
  if (stub.error) {
    throw new Error(
      `createFxQuote failed: ${stub.error.message}` +
        (full.error ? ` (phase10 columns: ${full.error.message})` : "")
    );
  }
  return normalizeRow(stub.data as Record<string, unknown>);
}

export async function getFxQuoteById(id: string): Promise<FxQuoteRow | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("fx_quotes")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`getFxQuoteById failed: ${error.message}`);
  if (!data) return null;
  return normalizeRow(data as Record<string, unknown>);
}

export async function getFxQuoteByStableFxId(
  stablefxQuoteId: string
): Promise<FxQuoteRow | null> {
  const supabase = getSupabaseClient();

  const byCol = await supabase
    .from("fx_quotes")
    .select("*")
    .eq("stablefx_quote_id", stablefxQuoteId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!byCol.error && byCol.data) {
    return normalizeRow(byCol.data as Record<string, unknown>);
  }

  const { data, error } = await supabase
    .from("fx_quotes")
    .select("*")
    .contains("metadata", { stablefx_quote_id: stablefxQuoteId })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`getFxQuoteByStableFxId failed: ${error.message}`);
  if (!data) return null;
  return normalizeRow(data as Record<string, unknown>);
}

export async function updateFxQuote(
  id: string,
  patch: Partial<{
    status: FxQuoteStatus;
    spread: string | number;
    maker: string;
    stablefx_trade_id: string;
    remittance_id: string;
    metadata: Record<string, unknown>;
    expires_at: string;
  }>
): Promise<FxQuoteRow> {
  const supabase = getSupabaseClient();
  const existing = await getFxQuoteById(id);
  if (!existing) throw new Error(`updateFxQuote: quote ${id} not found`);

  const metadata = {
    ...existing.metadata,
    ...(patch.metadata ?? {}),
    status: patch.status ?? existing.status,
    maker: patch.maker ?? existing.maker,
    spread: patch.spread ?? existing.spread,
    stablefx_trade_id: patch.stablefx_trade_id ?? existing.stablefx_trade_id,
    remittance_id: patch.remittance_id ?? existing.remittance_id,
  };

  const fullPatch = { ...patch, metadata };
  const full = await supabase
    .from("fx_quotes")
    .update(fullPatch)
    .eq("id", id)
    .select()
    .single();

  if (!full.error && full.data) {
    return normalizeRow(full.data as Record<string, unknown>);
  }

  const stub = await supabase
    .from("fx_quotes")
    .update({
      metadata,
      expires_at: patch.expires_at ?? existing.expires_at,
    })
    .eq("id", id)
    .select()
    .single();

  if (stub.error) {
    throw new Error(`updateFxQuote failed: ${stub.error.message}`);
  }
  return normalizeRow(stub.data as Record<string, unknown>);
}
