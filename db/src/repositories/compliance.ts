import { getSupabaseClient } from "../client";

export type ComplianceStatus = "open" | "reviewed" | "cleared";

export interface ComplianceCheckRow {
  id: string;
  address: string;
  reason: string;
  status: ComplianceStatus;
  created_at: string;
}

export interface InsertComplianceCheckInput {
  address: string;
  reason: string;
  status?: ComplianceStatus;
}

export async function insertComplianceCheck(
  input: InsertComplianceCheckInput
): Promise<ComplianceCheckRow> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("compliance_checks")
    .insert({
      address: input.address.trim().toLowerCase(),
      reason: input.reason,
      status: input.status ?? "open",
    })
    .select()
    .single();

  if (error) throw new Error(`insertComplianceCheck failed: ${error.message}`);
  return data as ComplianceCheckRow;
}
