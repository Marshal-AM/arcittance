// frontend/lib/types.ts

// ─── Employee ─────────────────────────────────────────────────────────────
export interface Employee {
  id:                 bigint;
  wallet:             `0x${string}`;
  salaryAmount:       bigint;
  payToken:           `0x${string}`;
  payInterval:        bigint;
  nextPaymentDue:     bigint;
  approvedCap:        bigint;
  destinationChainId: number;
  routingMethod:      number;
  transferSpeed:      number;
  active:             boolean;
}

// ─── Milestone ────────────────────────────────────────────────────────────
export interface Milestone {
  id:                bigint;
  payer:             `0x${string}`;
  payee:             `0x${string}`;
  token:             `0x${string}`;
  amount:            bigint;
  approvers:         `0x${string}`[];
  approvalsRequired: bigint;
  approvalCount:     bigint;
  disputeDeadline:   bigint;
  released:          boolean;
  reclaimed:         boolean;
}

// ─── Plan ─────────────────────────────────────────────────────────────────
export interface Plan {
  id:           bigint;
  provider:     `0x${string}`;
  token:        `0x${string}`;
  chargeAmount: bigint;
  interval:     bigint;
  maxCharges:   bigint;
  chargeCount:  bigint;
  expiry:       bigint;
  active:       boolean;
}

// ─── Subscription ─────────────────────────────────────────────────────────
export interface Subscription {
  id:            bigint;
  subscriber:    `0x${string}`;
  planId:        bigint;
  approvedCap:   bigint;
  totalCharged:  bigint;
  nextChargeDue: bigint;
  active:        boolean;
}

// ─── API Response shapes ──────────────────────────────────────────────────
export interface OrganizationDTO {
  id:           string;
  name:         string;
  creator:      string;
  vault:        string | null;
  vaultCreated: boolean;
  createdAt:    string;
}

export interface EmployeeDTO {
  id:                 string;
  wallet:             string;
  salaryAmount:       string;
  payToken:           string;
  payInterval:        string;
  nextPaymentDue:     string;
  approvedCap:        string;
  destinationChainId: number;
  destinationName:    string;
  routingMethod:      number;
  transferSpeed:      number;
  active:             boolean;
}

export type RemittanceStatus = "pending" | "settled" | "failed";

export interface RemittanceDTO {
  id:                 string;
  senderAddress:      string;
  recipientAddress:   string;
  amount:             string;
  fee:                string;
  destinationChainId: number;
  destinationName:    string;
  routingMethod:      number;
  status:             RemittanceStatus;
  txHash:             string | null;
  attestationHash:    string | null;
  createdAt:          string;
}

export interface MilestoneDTO {
  id:                string;
  payer:             string;
  payee:             string;
  token:             string;
  amount:            string;
  approvers:         string[];
  approvalsRequired: string;
  approvalCount:     string;
  disputeDeadline:   string;
  status:            "active" | "released" | "reclaimed" | "expired";
  /** Off-chain (Supabase) */
  title?:            string | null;
  description?:      string | null;
}

export interface SubscriptionDTO {
  id:            string;
  subscriber:    string;
  planId:        string;
  approvedCap:   string;
  totalCharged:  string;
  nextChargeDue: string;
  active:        boolean;
}

// ─── Tx status ────────────────────────────────────────────────────────────
export type TxStatus =
  | { status: "idle" }
  | {
      status: "pending";
      hash?: string;
      detail?: string;
      explorerBase?: string;
      chainLabel?: string;
    }
  | {
      status: "success";
      hash?: string;
      detail?: string;
      explorerBase?: string;
      chainLabel?: string;
    }
  | { status: "error"; error: string };
