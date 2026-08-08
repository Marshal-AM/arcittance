// frontend/lib/contracts/abis.ts
/**
 * Typed ABIs for all Arcittance contracts.
 * These match the deployed Solidity contracts exactly.
 * Used by wagmi useReadContract / useWriteContract hooks.
 */

export const PAYROLL_VAULT_ABI = [
  // ── View functions ───────────────────────────────────────────────────────
  {
    type: "function", name: "employeeCount",
    inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view",
  },
  {
    type: "function", name: "owner",
    inputs: [], outputs: [{ type: "address" }], stateMutability: "view",
  },
  {
    type: "function", name: "schedulerContract",
    inputs: [], outputs: [{ type: "address" }], stateMutability: "view",
  },
  {
    type: "function", name: "vaultBalance",
    inputs: [{ name: "token", type: "address" }],
    outputs: [{ type: "uint256" }], stateMutability: "view",
  },
  {
    type: "function", name: "getEmployee",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{
      type: "tuple",
      components: [
        { name: "wallet",         type: "address" },
        { name: "salaryAmount",   type: "uint256" },
        { name: "payToken",       type: "address" },
        { name: "payInterval",    type: "uint256" },
        { name: "nextPaymentDue", type: "uint256" },
        { name: "approvedCap",    type: "uint256" },
        { name: "destinationChainId", type: "uint32"  },
        { name: "routingMethod",      type: "uint8"   },
        { name: "transferSpeed",      type: "uint8"   },
        { name: "active",         type: "bool"    },
      ],
    }],
    stateMutability: "view",
  },
  // ── Write functions ──────────────────────────────────────────────────────
  {
    type: "function", name: "deposit",
    inputs: [
      { name: "token",  type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [], stateMutability: "nonpayable",
  },
  {
    type: "function", name: "registerEmployee",
    inputs: [
      { name: "wallet",      type: "address" },
      { name: "salary",      type: "uint256" },
      { name: "token",       type: "address" },
      { name: "interval",    type: "uint256" },
      { name: "cap",         type: "uint256" },
      { name: "destinationChainId", type: "uint32"  },
      { name: "routingMethod",      type: "uint8"   },
      { name: "transferSpeed",      type: "uint8"   },
    ],
    outputs: [{ name: "id", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function", name: "runPayroll",
    inputs: [], outputs: [], stateMutability: "nonpayable",
  },
  {
    type: "function", name: "deactivateEmployee",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [], stateMutability: "nonpayable",
  },
  // ── Events ───────────────────────────────────────────────────────────────
  {
    type: "event", name: "VaultDeposited",
    inputs: [
      { name: "token",  type: "address", indexed: true  },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event", name: "EmployeeRegistered",
    inputs: [
      { name: "id",          type: "uint256", indexed: true  },
      { name: "wallet",      type: "address", indexed: true  },
      { name: "salary",      type: "uint256", indexed: false },
      { name: "destinationChainId", type: "uint32", indexed: false },
      { name: "routingMethod",      type: "uint8",  indexed: false },
    ],
  },
  {
    type: "event", name: "PayrollExecuted",
    inputs: [
      { name: "employeeCount", type: "uint256", indexed: false },
      { name: "totalPayout",   type: "uint256", indexed: false },
    ],
  },
  {
    type: "event", name: "EmployeeDeactivated",
    inputs: [{ name: "id", type: "uint256", indexed: true }],
  },
] as const;

export const CONDITIONAL_ESCROW_ABI = [
  {
    type: "function", name: "milestoneCount",
    inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view",
  },
  {
    type: "function", name: "createMilestone",
    inputs: [
      { name: "payee",             type: "address"   },
      { name: "token",             type: "address"   },
      { name: "amount",            type: "uint256"   },
      { name: "approvers",         type: "address[]" },
      { name: "approvalsRequired", type: "uint256"   },
      { name: "disputeDeadline",   type: "uint256"   },
    ],
    outputs: [{ name: "id", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function", name: "approveMilestone",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [], stateMutability: "nonpayable",
  },
  {
    type: "function", name: "reclaimExpired",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [], stateMutability: "nonpayable",
  },
  // ── View functions ───────────────────────────────────────────────────────
  {
    // getMilestone returns individual named values (not a struct), so outputs must be
    // flat — NOT a single tuple. A single-tuple output adds an extra offset indirection
    // layer that misaligns the ABI decode when the return contains a dynamic type
    // (address[]).  Flat named outputs = correct encoding match.
    type: "function", name: "getMilestone",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [
      { name: "payer",             type: "address"   },
      { name: "payee",             type: "address"   },
      { name: "token",             type: "address"   },
      { name: "amount",            type: "uint256"   },
      { name: "approvers",         type: "address[]" },
      { name: "approvalsRequired", type: "uint256"   },
      { name: "approvalCount",     type: "uint256"   },
      { name: "disputeDeadline",   type: "uint256"   },
      { name: "released",          type: "bool"      },
      { name: "reclaimed",         type: "bool"      },
    ],
    stateMutability: "view",
  },
  {
    type: "event", name: "MilestoneCreated",
    inputs: [
      { name: "id",     type: "uint256", indexed: true  },
      { name: "payer",  type: "address", indexed: true  },
      { name: "payee",  type: "address", indexed: true  },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event", name: "MilestoneReleased",
    inputs: [
      { name: "id",     type: "uint256", indexed: true  },
      { name: "payee",  type: "address", indexed: true  },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event", name: "MilestoneReclaimed",
    inputs: [
      { name: "id",     type: "uint256", indexed: true  },
      { name: "payer",  type: "address", indexed: true  },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
] as const;

export const SUBSCRIPTION_MANAGER_ABI = [
  {
    type: "function", name: "planCount",
    inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view",
  },
  {
    type: "function", name: "subscriptionCount",
    inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view",
  },
  {
    type: "function", name: "createPlan",
    inputs: [
      { name: "token",        type: "address" },
      { name: "chargeAmount", type: "uint256" },
      { name: "interval",     type: "uint256" },
      { name: "maxCharges",   type: "uint256" },
      { name: "expiry",       type: "uint256" },
    ],
    outputs: [{ name: "planId", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function", name: "subscribe",
    inputs: [
      { name: "planId",      type: "uint256" },
      { name: "approvedCap", type: "uint256" },
    ],
    outputs: [{ name: "subscriptionId", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function", name: "charge",
    inputs: [{ name: "subscriptionId", type: "uint256" }],
    outputs: [], stateMutability: "nonpayable",
  },
  {
    type: "function", name: "revoke",
    inputs: [{ name: "subscriptionId", type: "uint256" }],
    outputs: [], stateMutability: "nonpayable",
  },
  // ── View functions (public mapping getters) ───────────────────────────────
  {
    type: "function", name: "plans",
    inputs: [{ name: "planId", type: "uint256" }],
    outputs: [{
      type: "tuple",
      components: [
        { name: "provider",     type: "address" },
        { name: "token",        type: "address" },
        { name: "chargeAmount", type: "uint256" },
        { name: "interval",     type: "uint256" },
        { name: "maxCharges",   type: "uint256" },
        { name: "chargeCount",  type: "uint256" },
        { name: "expiry",       type: "uint256" },
        { name: "active",       type: "bool"    },
      ],
    }],
    stateMutability: "view",
  },
  {
    type: "function", name: "subscriptions",
    inputs: [{ name: "subscriptionId", type: "uint256" }],
    outputs: [{
      type: "tuple",
      components: [
        { name: "subscriber",    type: "address" },
        { name: "planId",        type: "uint256" },
        { name: "approvedCap",   type: "uint256" },
        { name: "totalCharged",  type: "uint256" },
        { name: "nextChargeDue", type: "uint256" },
        { name: "active",        type: "bool"    },
      ],
    }],
    stateMutability: "view",
  },
  {
    type: "event", name: "PlanCreated",
    inputs: [
      { name: "planId",       type: "uint256", indexed: true  },
      { name: "provider",     type: "address", indexed: true  },
      { name: "token",        type: "address", indexed: false },
      { name: "chargeAmount", type: "uint256", indexed: false },
      { name: "interval",     type: "uint256", indexed: false },
    ],
  },
  {
    type: "event", name: "Subscribed",
    inputs: [
      { name: "subscriptionId", type: "uint256", indexed: true  },
      { name: "subscriber",     type: "address", indexed: true  },
      { name: "planId",         type: "uint256", indexed: true  },
      { name: "approvedCap",    type: "uint256", indexed: false },
    ],
  },
  {
    type: "event", name: "Charged",
    inputs: [
      { name: "subscriptionId", type: "uint256", indexed: true  },
      { name: "provider",       type: "address", indexed: true  },
      { name: "amount",         type: "uint256", indexed: false },
      { name: "nextChargeDue",  type: "uint256", indexed: false },
    ],
  },
  {
    type: "event", name: "Revoked",
    inputs: [
      { name: "subscriptionId", type: "uint256", indexed: true  },
      { name: "subscriber",     type: "address", indexed: true  },
    ],
  },
] as const;

export const REMITTANCE_VAULT_ABI = [
  {
    type: "function", name: "remittanceCount",
    inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view",
  },
  {
    type: "function", name: "feeBps",
    inputs: [], outputs: [{ type: "uint16" }], stateMutability: "view",
  },
  {
    type: "function", name: "sendRemittance",
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "recipient", type: "address" },
      { name: "destinationChainId", type: "uint32" },
      { name: "routingMethod", type: "uint8" },
      { name: "attestationHash", type: "bytes32" },
    ],
    outputs: [{ name: "id", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function", name: "remittances",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{
      type: "tuple",
      components: [
        { name: "sender", type: "address" },
        { name: "recipient", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "fee", type: "uint256" },
        { name: "destinationChainId", type: "uint32" },
        { name: "routingMethod", type: "uint8" },
        { name: "attestationHash", type: "bytes32" },
        { name: "completed", type: "bool" },
      ],
    }],
    stateMutability: "view",
  },
  {
    type: "event", name: "RemittanceSent",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "sender", type: "address", indexed: true },
      { name: "recipient", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "fee", type: "uint256", indexed: false },
      { name: "destinationChainId", type: "uint32", indexed: false },
      { name: "routingMethod", type: "uint8", indexed: false },
      { name: "attestationHash", type: "bytes32", indexed: false },
    ],
  },
] as const;

export const PAYROLL_ORG_REGISTRY_ABI = [
  {
    type: "function", name: "organizationCount",
    inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view",
  },
  {
    type: "function", name: "createOrganization",
    inputs: [{ name: "name", type: "string" }],
    outputs: [{ name: "orgId", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function", name: "createVault",
    inputs: [{ name: "orgId", type: "uint256" }],
    outputs: [{ name: "vaultAddr", type: "address" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function", name: "getOrganization",
    inputs: [{ name: "orgId", type: "uint256" }],
    outputs: [{
      type: "tuple",
      components: [
        { name: "name",         type: "string"  },
        { name: "creator",      type: "address" },
        { name: "vault",        type: "address" },
        { name: "createdAt",    type: "uint64"  },
        { name: "vaultCreated", type: "bool"    },
      ],
    }],
    stateMutability: "view",
  },
  {
    type: "function", name: "getCreatorOrgCount",
    inputs: [{ name: "creator", type: "address" }],
    outputs: [{ type: "uint256" }], stateMutability: "view",
  },
  {
    type: "function", name: "getCreatorOrgId",
    inputs: [
      { name: "creator", type: "address" },
      { name: "index",   type: "uint256" },
    ],
    outputs: [{ type: "uint256" }], stateMutability: "view",
  },
  {
    type: "event", name: "OrganizationCreated",
    inputs: [
      { name: "orgId",   type: "uint256", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "name",    type: "string",  indexed: false },
    ],
  },
  {
    type: "event", name: "VaultCreated",
    inputs: [
      { name: "orgId",   type: "uint256", indexed: true },
      { name: "vault",   type: "address", indexed: true },
      { name: "creator", type: "address", indexed: true },
    ],
  },
] as const;

export const FX_SETTLEMENT_ESCROW_ABI = [
  {
    type: "function", name: "open",
    inputs: [
      { name: "remittanceRef", type: "bytes32" },
      { name: "stableFxTradeId", type: "bytes32" },
      { name: "payer", type: "address" },
      { name: "usdcAmount", type: "uint256" },
    ],
    outputs: [], stateMutability: "nonpayable",
  },
  {
    type: "function", name: "confirmFx",
    inputs: [
      { name: "remittanceRef", type: "bytes32" },
      { name: "settlementTxHash", type: "bytes32" },
    ],
    outputs: [], stateMutability: "nonpayable",
  },
  {
    type: "function", name: "confirmPayout",
    inputs: [
      { name: "remittanceRef", type: "bytes32" },
      { name: "payoutTxHash", type: "bytes32" },
    ],
    outputs: [], stateMutability: "nonpayable",
  },
  {
    type: "function", name: "isSettled",
    inputs: [{ name: "remittanceRef", type: "bytes32" }],
    outputs: [{ type: "bool" }], stateMutability: "view",
  },
  {
    type: "function", name: "getSettlement",
    inputs: [{ name: "remittanceRef", type: "bytes32" }],
    outputs: [{
      type: "tuple",
      components: [
        { name: "stableFxTradeId", type: "bytes32" },
        { name: "payer", type: "address" },
        { name: "usdcAmount", type: "uint256" },
        { name: "fxSettlementTxHash", type: "bytes32" },
        { name: "payoutTxHash", type: "bytes32" },
        { name: "fxConfirmed", type: "bool" },
        { name: "payoutConfirmed", type: "bool" },
        { name: "opened", type: "bool" },
      ],
    }],
    stateMutability: "view",
  },
] as const;

export const ERC20_ABI = [
  {
    type: "function", name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }], stateMutability: "view",
  },
  {
    type: "function", name: "allowance",
    inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }],
    outputs: [{ type: "uint256" }], stateMutability: "view",
  },
  {
    type: "function", name: "approve",
    inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ type: "bool" }], stateMutability: "nonpayable",
  },
  {
    type: "function", name: "decimals",
    inputs: [], outputs: [{ type: "uint8" }], stateMutability: "view",
  },
  {
    type: "function", name: "symbol",
    inputs: [], outputs: [{ type: "string" }], stateMutability: "view",
  },
] as const;
