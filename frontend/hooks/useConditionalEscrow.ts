// frontend/hooks/useConditionalEscrow.ts
"use client";

import { useReadContract, useWriteContract, usePublicClient } from "wagmi";
import { useState, useCallback } from "react";
import { CONDITIONAL_ESCROW_ABI, ERC20_ABI } from "@/lib/contracts/abis";
import { getContractAddresses } from "@/lib/contracts/addresses";
import type { TxStatus } from "@/lib/types";

let _escrowAddress: `0x${string}` | null = null;
function escrowAddress() {
  return (_escrowAddress ??= getContractAddresses().ConditionalEscrow);
}

export interface CreateMilestoneResult {
  hash: `0x${string}`;
  onChainId: string;
}

export function useMilestoneCount() {
  return useReadContract({
    address:      escrowAddress(),
    abi:          CONDITIONAL_ESCROW_ABI,
    functionName: "milestoneCount",
    query:        { refetchInterval: 6000 },
  });
}

export function useCreateMilestone() {
  const { writeContractAsync }  = useWriteContract();
  const publicClient            = usePublicClient();
  const [txStatus, setTxStatus] = useState<TxStatus>({ status: "idle" });

  const createMilestone = useCallback(async (params: {
    payee:             `0x${string}`;
    token:             `0x${string}`;
    amount:            bigint;
    approvers:         `0x${string}`[];
    approvalsRequired: bigint;
    disputeDeadline:   bigint;
  }) => {
    setTxStatus({ status: "pending" });
    try {
      // Always use the connected wallet — on-chain payer must be msg.sender so
      // reclaimExpired works for the user who locked funds. Keeper create would
      // set payer to the Circle facilitator wallet instead.
      if (!publicClient) throw new Error("No public client");
      // Step 1: approve escrow contract on ERC-20 precompile
      const approveTxHash = await writeContractAsync({
        address:      params.token,
        abi:          ERC20_ABI,
        functionName: "approve",
        args:         [escrowAddress(), params.amount],
        gas:          200_000n,
      });
      setTxStatus({ status: "pending", hash: approveTxHash, detail: "Approve USDC…" });

      // Step 2: wait for approval to be mined before createMilestone checks allowance
      await publicClient.waitForTransactionReceipt({ hash: approveTxHash });

      // Step 3: create milestone
      const hash = await writeContractAsync({
        address:      escrowAddress(),
        abi:          CONDITIONAL_ESCROW_ABI,
        functionName: "createMilestone",
        args: [
          params.payee,
          params.token,
          params.amount,
          params.approvers,
          params.approvalsRequired,
          params.disputeDeadline,
        ],
        gas: 500_000n,
      });
      setTxStatus({ status: "pending", hash, detail: "Creating milestone…" });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status === "reverted") {
        setTxStatus({ status: "error", error: "createMilestone reverted on-chain" });
        return;
      }
      const count = (await publicClient.readContract({
        address: escrowAddress(),
        abi: CONDITIONAL_ESCROW_ABI,
        functionName: "milestoneCount",
      })) as bigint;
      const onChainId = count > 0n ? String(count - 1n) : "0";
      setTxStatus({ status: "success", hash });
      return { hash, onChainId };
    } catch (err: any) {
      setTxStatus({ status: "error", error: err.shortMessage ?? err.message });
      throw err;
    }
  }, [writeContractAsync, publicClient]);

  return { createMilestone, txStatus };
}

export function useApproveMilestone() {
  const { writeContractAsync } = useWriteContract();

  // Approvals must be signed by an address in milestone.approvers (msg.sender).
  // The Circle facilitator wallet cannot approve on a user's behalf.
  return useCallback(async (id: bigint) => {
    return writeContractAsync({
      address:      escrowAddress(),
      abi:          CONDITIONAL_ESCROW_ABI,
      functionName: "approveMilestone",
      args:         [id],
      gas:          300_000n,
    });
  }, [writeContractAsync]);
}

export function useReclaimExpired() {
  const { writeContractAsync } = useWriteContract();
  return useCallback(async (id: bigint) => {
    return writeContractAsync({
      address:      escrowAddress(),
      abi:          CONDITIONAL_ESCROW_ABI,
      functionName: "reclaimExpired",
      args:         [id],
      gas:          300_000n,
    });
  }, [writeContractAsync]);
}
