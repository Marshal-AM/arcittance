// frontend/hooks/usePayrollVault.ts
"use client";

import { useReadContract, useWriteContract, useAccount, usePublicClient } from "wagmi";
import { useState, useCallback }             from "react";
import { PAYROLL_VAULT_ABI, ERC20_ABI }      from "@/lib/contracts/abis";
import type { TxStatus }                     from "@/lib/types";
import { isCircleKeeperEnabled, useCircleKeeperRunPayroll } from "./useCircleKeeper";
import { useOptionalPayrollOrg } from "@/contexts/PayrollOrgContext";
import type { OrchestrationResult } from "@/lib/circle/cross-chain-orchestrator";

async function orchestratePayrollCctp(
  vault: `0x${string}`,
  payrollTxHash: string,
): Promise<OrchestrationResult> {
  const res = await fetch("/api/cross-chain/orchestrate", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ payrollTxHash, vaultAddress: vault }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? "CCTP orchestration failed");
  }
  return data as OrchestrationResult;
}

function orchestrationSummary(result: OrchestrationResult): string | undefined {
  if (result.cctpCompletions.length === 0) return undefined;
  const confirmed = result.cctpCompletions.filter((c) => c.confirmed).length;
  const total = result.cctpCompletions.length;
  if (confirmed === total) {
    return `CCTP delivered to ${total} destination wallet${total === 1 ? "" : "s"}`;
  }
  return `CCTP submitted for ${total} employee${total === 1 ? "" : "s"} (${confirmed}/${total} confirmed on destination)`;
}

function useVaultAddress(): `0x${string}` | undefined {
  return useOptionalPayrollOrg()?.selectedVault ?? undefined;
}

// ─── Read: employee count ─────────────────────────────────────────────────
export function useEmployeeCount() {
  const vault = useVaultAddress();
  return useReadContract({
    address:      vault,
    abi:          PAYROLL_VAULT_ABI,
    functionName: "employeeCount",
    query:        { enabled: !!vault, refetchInterval: 6000 },
  });
}

// ─── Read: single employee by ID ─────────────────────────────────────────
export function useEmployee(id: bigint | undefined) {
  const vault = useVaultAddress();
  return useReadContract({
    address:      vault,
    abi:          PAYROLL_VAULT_ABI,
    functionName: "getEmployee",
    args:         id !== undefined ? [id] : undefined,
    query:        { enabled: !!vault && id !== undefined },
  });
}

// ─── Read: vault balance for a token ─────────────────────────────────────
export function useVaultTokenBalance(tokenAddress?: `0x${string}`) {
  const vault = useVaultAddress();
  return useReadContract({
    address:      vault,
    abi:          PAYROLL_VAULT_ABI,
    functionName: "vaultBalance",
    args:         tokenAddress ? [tokenAddress] : undefined,
    query:        { enabled: !!vault && !!tokenAddress, refetchInterval: 6000 },
  });
}

// ─── Read: user's token allowance for the vault ───────────────────────────
export function useVaultAllowance(tokenAddress?: `0x${string}`) {
  const { address } = useAccount();
  const vault       = useVaultAddress();
  return useReadContract({
    address:      tokenAddress,
    abi:          ERC20_ABI,
    functionName: "allowance",
    args:         address && vault ? [address, vault] : undefined,
    query:        { enabled: !!tokenAddress && !!address && !!vault },
  });
}

// ─── Write: deposit ───────────────────────────────────────────────────────
export function useDeposit() {
  const vault                   = useVaultAddress();
  const { writeContractAsync }  = useWriteContract();
  const publicClient            = usePublicClient();
  const [txStatus, setTxStatus] = useState<TxStatus>({ status: "idle" });

  const deposit = useCallback(async (
    tokenAddress: `0x${string}`,
    amount:       bigint,
  ) => {
    if (!vault) throw new Error("No payroll vault selected");
    if (!publicClient) throw new Error("No public client");
    setTxStatus({ status: "pending" });
    try {
      const approveTxHash = await writeContractAsync({
        address:      tokenAddress,
        abi:          ERC20_ABI,
        functionName: "approve",
        args:         [vault, amount],
        gas:          200_000n,
      });
      setTxStatus({ status: "pending", hash: approveTxHash });

      const approveReceipt = await publicClient.waitForTransactionReceipt({ hash: approveTxHash });
      if (approveReceipt.status === "reverted") {
        setTxStatus({ status: "error", error: "Approval transaction reverted on-chain" });
        return;
      }

      const depositTxHash = await writeContractAsync({
        address:      vault,
        abi:          PAYROLL_VAULT_ABI,
        functionName: "deposit",
        args:         [tokenAddress, amount],
        gas:          300_000n,
      });
      setTxStatus({ status: "pending", hash: depositTxHash });

      const depositReceipt = await publicClient.waitForTransactionReceipt({ hash: depositTxHash });
      if (depositReceipt.status === "reverted") {
        setTxStatus({ status: "error", error: "Deposit transaction reverted on-chain" });
        return;
      }

      setTxStatus({ status: "success", hash: depositTxHash });
      return depositTxHash;
    } catch (err: any) {
      setTxStatus({ status: "error", error: err.shortMessage ?? err.message });
      throw err;
    }
  }, [writeContractAsync, publicClient, vault]);

  return { deposit, txStatus };
}

// ─── Write: register employee ─────────────────────────────────────────────
export function useRegisterEmployee() {
  const vault                   = useVaultAddress();
  const { writeContractAsync }  = useWriteContract();
  const publicClient            = usePublicClient();
  const [txStatus, setTxStatus] = useState<TxStatus>({ status: "idle" });

  const registerEmployee = useCallback(async (params: {
    wallet:      `0x${string}`;
    salary:      bigint;
    token:       `0x${string}`;
    interval:    bigint;
    cap:         bigint;
    destinationChainId: number;
    routingMethod:      number;
    transferSpeed:      number;
  }) => {
    if (!vault) throw new Error("No payroll vault selected");
    if (!publicClient) throw new Error("No public client");
    setTxStatus({ status: "pending" });
    try {
      const hash = await writeContractAsync({
        address:      vault,
        abi:          PAYROLL_VAULT_ABI,
        functionName: "registerEmployee",
        args: [
          params.wallet,
          params.salary,
          params.token,
          params.interval,
          params.cap,
          params.destinationChainId,
          params.routingMethod,
          params.transferSpeed,
        ],
        gas: 300_000n,
      });
      setTxStatus({ status: "pending", hash });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status === "reverted") {
        setTxStatus({ status: "error", error: "Transaction reverted on-chain (check you own this vault)" });
        return;
      }

      setTxStatus({ status: "success", hash });
      return hash;
    } catch (err: any) {
      setTxStatus({ status: "error", error: err.shortMessage ?? err.message });
      throw err;
    }
  }, [writeContractAsync, publicClient, vault]);

  return { registerEmployee, txStatus };
}

// ─── Write: run payroll ───────────────────────────────────────────────────
export function useRunPayroll() {
  const vault                   = useVaultAddress();
  const { writeContractAsync }  = useWriteContract();
  const publicClient            = usePublicClient();
  const circleKeeperRunPayroll  = useCircleKeeperRunPayroll();
  const [txStatus, setTxStatus] = useState<TxStatus>({ status: "idle" });

  const runPayroll = useCallback(async () => {
    if (!vault) throw new Error("No payroll vault selected");
    setTxStatus({ status: "pending" });
    try {
      if (isCircleKeeperEnabled()) {
        const result = await circleKeeperRunPayroll(vault);
        const keeperOrch = (result as { orchestration?: OrchestrationResult | { error?: string } })
          .orchestration;
        const detail =
          keeperOrch && "cctpCompletions" in keeperOrch
            ? orchestrationSummary(keeperOrch)
            : keeperOrch && "error" in keeperOrch
              ? `Payroll on-chain; CCTP step failed: ${keeperOrch.error}`
              : undefined;
        setTxStatus(
          result.status === "success" && result.hash
            ? { status: "success", hash: result.hash, detail }
            : result,
        );
        return result.status === "success" ? result.hash : undefined;
      }

      if (!publicClient) throw new Error("No public client");
      const hash = await writeContractAsync({
        address:      vault,
        abi:          PAYROLL_VAULT_ABI,
        functionName: "runPayroll",
        gas:          2_000_000n,
      });
      setTxStatus({ status: "pending", hash });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status === "reverted") {
        setTxStatus({ status: "error", error: "Payroll transaction reverted on-chain (check vault balance and employee setup)" });
        return;
      }

      setTxStatus({ status: "pending", hash, detail: "Completing CCTP bridge to destination…" });

      try {
        const orchestration = await orchestratePayrollCctp(vault, hash);
        setTxStatus({
          status: "success",
          hash,
          detail: orchestrationSummary(orchestration),
        });
      } catch (orchErr: any) {
        setTxStatus({
          status: "error",
          error:
            `Payroll executed on Arc but CCTP delivery failed: ${orchErr.message ?? String(orchErr)}. ` +
            "USDC may be in the facilitator wallet — retry orchestration or contact support.",
        });
        return;
      }

      return hash;
    } catch (err: any) {
      setTxStatus({ status: "error", error: err.shortMessage ?? err.message });
      throw err;
    }
  }, [writeContractAsync, publicClient, circleKeeperRunPayroll, vault]);

  return { runPayroll, txStatus };
}

// ─── Write: deactivate employee ───────────────────────────────────────────
export function useDeactivateEmployee() {
  const vault                  = useVaultAddress();
  const { writeContractAsync } = useWriteContract();
  return useCallback(async (id: bigint) => {
    if (!vault) throw new Error("No payroll vault selected");
    return writeContractAsync({
      address:      vault,
      abi:          PAYROLL_VAULT_ABI,
      functionName: "deactivateEmployee",
      args:         [id],
      gas:          150_000n,
    });
  }, [writeContractAsync, vault]);
}
