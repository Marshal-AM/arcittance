"use client";

import { useCallback } from "react";
import type { TxStatus } from "@/lib/types";

const USE_CIRCLE_KEEPER =
  process.env.NEXT_PUBLIC_USE_CIRCLE_KEEPER === "true";

export function isCircleKeeperEnabled(): boolean {
  return USE_CIRCLE_KEEPER;
}

export function useCircleKeeperRunPayroll() {
  return useCallback(async (vaultAddress: `0x${string}`): Promise<TxStatus & { orchestration?: unknown }> => {
    const res = await fetch("/api/circle/keeper/run-payroll", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ vaultAddress }),
    });
    const data = await res.json();
    if (!res.ok) {
      return { status: "error", error: data.error ?? "Keeper payroll failed" };
    }
    return {
      status:        "success",
      hash:          data.txHash ?? data.transactionId,
      orchestration: data.orchestration,
    } as TxStatus & { orchestration?: unknown };
  }, []);
}

export function useCircleKeeperCharge() {
  return useCallback(async (subscriptionId: bigint): Promise<TxStatus> => {
    const res = await fetch("/api/circle/keeper/charge", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ subscriptionId: subscriptionId.toString() }),
    });
    const data = await res.json();
    if (!res.ok) {
      return { status: "error", error: data.error ?? "Keeper charge failed" };
    }
    return {
      status: "success",
      hash:   data.txHash ?? data.transactionId,
    };
  }, []);
}

export function useCircleKeeperApproveMilestone() {
  return useCallback(async (milestoneId: bigint): Promise<TxStatus> => {
    const res = await fetch("/api/circle/keeper/approve-milestone", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ milestoneId: milestoneId.toString() }),
    });
    const data = await res.json();
    if (!res.ok) {
      return { status: "error", error: data.error ?? "Keeper approve failed" };
    }
    return {
      status: "success",
      hash:   data.txHash ?? data.transactionId,
    };
  }, []);
}

export function useCircleKeeperBatchPayroll() {
  return useCallback(async (vaultAddress: `0x${string}`): Promise<TxStatus & { orchestration?: unknown }> => {
    const res = await fetch("/api/circle/keeper/batch-payroll", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ vaultAddress }),
    });
    const data = await res.json();
    if (!res.ok) {
      return { status: "error", error: data.error ?? "Batch payroll failed" };
    }
    return {
      status:        "success",
      hash:          data.txHash ?? data.transactionId,
      orchestration: data.orchestration,
    };
  }, []);
}

export function useCircleKeeperCreateMilestone() {
  return useCallback(async (params: {
    payee: string;
    token: string;
    amount: string;
    approvers: string[];
    approvalsRequired: string;
    disputeDeadline: string;
  }): Promise<TxStatus> => {
    const res = await fetch("/api/circle/keeper/create-milestone", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(params),
    });
    const data = await res.json();
    if (!res.ok) {
      return { status: "error", error: data.error ?? "Keeper create milestone failed" };
    }
    return {
      status: "success",
      hash:   data.txHash ?? data.createTxId,
    };
  }, []);
}
