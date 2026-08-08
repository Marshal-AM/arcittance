// frontend/hooks/useSubscriptionManager.ts
"use client";

import {
  useReadContract,
  useWriteContract,
  usePublicClient,
  useChainId,
  useSwitchChain,
} from "wagmi";
import { useState, useCallback } from "react";
import { SUBSCRIPTION_MANAGER_ABI, ERC20_ABI } from "@/lib/contracts/abis";
import { CHAIN_ID, getContractAddresses } from "@/lib/contracts/addresses";
import type { TxStatus } from "@/lib/types";
import { isCircleKeeperEnabled, useCircleKeeperCharge } from "./useCircleKeeper";

let _subAddress: `0x${string}` | null = null;
function subAddress() {
  return (_subAddress ??= getContractAddresses().SubscriptionManager);
}

export interface CreatePlanResult {
  hash: `0x${string}`;
  onChainId: string;
}

async function ensureArcChain(
  chainId: number,
  switchChainAsync: ((args: { chainId: typeof CHAIN_ID }) => Promise<unknown>) | undefined
) {
  if (chainId === CHAIN_ID) return;
  if (!switchChainAsync) {
    throw new Error("Wrong network — switch your wallet to Arc Testnet (5042002)");
  }
  await switchChainAsync({ chainId: CHAIN_ID });
}

export function usePlanCount() {
  return useReadContract({
    address:      subAddress(),
    abi:          SUBSCRIPTION_MANAGER_ABI,
    functionName: "planCount",
    query:        { refetchInterval: 6000 },
  });
}

export function useCreatePlan() {
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const [txStatus, setTxStatus] = useState<TxStatus>({ status: "idle" });

  const createPlan = useCallback(async (params: {
    token:        `0x${string}`;
    chargeAmount: bigint;
    interval:     bigint;
    maxCharges:   bigint;
    expiry:       bigint;
  }) => {
    if (!publicClient) throw new Error("No public client");
    if (params.chargeAmount <= 0n) {
      throw new Error("Charge amount must be greater than 0");
    }
    setTxStatus({ status: "pending", detail: "Confirm in wallet…" });
    try {
      await ensureArcChain(chainId, switchChainAsync);
      const hash = await writeContractAsync({
        address:      subAddress(),
        abi:          SUBSCRIPTION_MANAGER_ABI,
        functionName: "createPlan",
        args:         [params.token, params.chargeAmount, params.interval, params.maxCharges, params.expiry],
        chainId:      CHAIN_ID,
      });
      setTxStatus({ status: "pending", hash, detail: "Waiting for Arc confirmation…" });
      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 1,
        timeout: 120_000,
      });
      if (receipt.status === "reverted") {
        setTxStatus({
          status: "error",
          error: "createPlan reverted on-chain — check Arc Testnet wallet + USDC gas",
        });
        return;
      }
      const count = (await publicClient.readContract({
        address: subAddress(),
        abi: SUBSCRIPTION_MANAGER_ABI,
        functionName: "planCount",
      })) as bigint;
      const onChainId = count > 0n ? String(count - 1n) : "0";
      setTxStatus({ status: "success", hash });
      return { hash, onChainId };
    } catch (err: any) {
      setTxStatus({ status: "error", error: err.shortMessage ?? err.message });
      throw err;
    }
  }, [writeContractAsync, publicClient, chainId, switchChainAsync]);

  return { createPlan, txStatus };
}

export function useSubscribe() {
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const [txStatus, setTxStatus] = useState<TxStatus>({ status: "idle" });

  const subscribe = useCallback(async (params: {
    planId:      bigint;
    approvedCap: bigint;
    token:       `0x${string}`;  // needed for ERC-20 approve step
  }) => {
    if (!publicClient) throw new Error("No public client");
    setTxStatus({ status: "pending", detail: "Confirm in wallet…" });
    try {
      await ensureArcChain(chainId, switchChainAsync);

      // Step 1: approve SubscriptionManager on ERC-20 precompile
      const approveTxHash = await writeContractAsync({
        address:      params.token,
        abi:          ERC20_ABI,
        functionName: "approve",
        args:         [subAddress(), params.approvedCap],
        chainId:      CHAIN_ID,
      });

      // Step 2: wait for approval to be mined before subscribe checks allowance
      setTxStatus({
        status: "pending",
        hash: approveTxHash,
        detail: "Waiting for approve confirmation…",
      });
      const approveReceipt = await publicClient.waitForTransactionReceipt({
        hash: approveTxHash,
        confirmations: 1,
        timeout: 120_000,
      });
      if (approveReceipt.status === "reverted") {
        setTxStatus({ status: "error", error: "USDC approve reverted on-chain" });
        return;
      }

      // Step 3: subscribe
      const hash = await writeContractAsync({
        address:      subAddress(),
        abi:          SUBSCRIPTION_MANAGER_ABI,
        functionName: "subscribe",
        args:         [params.planId, params.approvedCap],
        chainId:      CHAIN_ID,
      });
      setTxStatus({ status: "pending", hash, detail: "Waiting for subscribe confirmation…" });
      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 1,
        timeout: 120_000,
      });
      if (receipt.status === "reverted") {
        setTxStatus({ status: "error", error: "subscribe reverted on-chain" });
        return;
      }
      setTxStatus({ status: "success", hash });
      return hash;
    } catch (err: any) {
      setTxStatus({ status: "error", error: err.shortMessage ?? err.message });
      throw err;
    }
  }, [writeContractAsync, publicClient, chainId, switchChainAsync]);

  return { subscribe, txStatus };
}

export function useCharge() {
  const { writeContractAsync } = useWriteContract();
  const circleKeeperCharge       = useCircleKeeperCharge();

  return useCallback(async (subscriptionId: bigint) => {
    if (isCircleKeeperEnabled()) {
      const result = await circleKeeperCharge(subscriptionId);
      if (result.status === "error") throw new Error(result.error);
      return result.hash;
    }
    return writeContractAsync({
      address:      subAddress(),
      abi:          SUBSCRIPTION_MANAGER_ABI,
      functionName: "charge",
      args:         [subscriptionId],
      gas:          300_000n,
    });
  }, [writeContractAsync, circleKeeperCharge]);
}

export function useRevoke() {
  const { writeContractAsync } = useWriteContract();
  return useCallback(async (subscriptionId: bigint) => {
    return writeContractAsync({
      address:      subAddress(),
      abi:          SUBSCRIPTION_MANAGER_ABI,
      functionName: "revoke",
      args:         [subscriptionId],
      gas:          200_000n,
    });
  }, [writeContractAsync]);
}
