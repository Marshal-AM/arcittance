"use client";

import { useWriteContract, usePublicClient } from "wagmi";
import { useCallback, useState } from "react";
import { PAYROLL_ORG_REGISTRY_ABI } from "@/lib/contracts/abis";
import { getPayrollOrgRegistryAddress } from "@/lib/contracts/addresses";
import type { TxStatus } from "@/lib/types";

export function useCreateOrganization() {
  const { writeContractAsync }  = useWriteContract();
  const publicClient            = usePublicClient();
  const [txStatus, setTxStatus] = useState<TxStatus>({ status: "idle" });

  const createOrganization = useCallback(async (name: string) => {
    if (!publicClient) throw new Error("No public client");
    setTxStatus({ status: "pending" });
    try {
      const hash = await writeContractAsync({
        address:      getPayrollOrgRegistryAddress(),
        abi:          PAYROLL_ORG_REGISTRY_ABI,
        functionName: "createOrganization",
        args:         [name],
        gas:          300_000n,
      });
      setTxStatus({ status: "pending", hash });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status === "reverted") {
        setTxStatus({ status: "error", error: "Create organisation reverted on-chain" });
        return;
      }
      setTxStatus({ status: "success", hash });
      return hash;
    } catch (err: any) {
      setTxStatus({ status: "error", error: err.shortMessage ?? err.message });
      throw err;
    }
  }, [writeContractAsync, publicClient]);

  return { createOrganization, txStatus };
}

export function useCreateOrgVault() {
  const { writeContractAsync }  = useWriteContract();
  const publicClient            = usePublicClient();
  const [txStatus, setTxStatus] = useState<TxStatus>({ status: "idle" });

  const createVault = useCallback(async (orgId: bigint) => {
    if (!publicClient) throw new Error("No public client");
    setTxStatus({ status: "pending" });
    try {
      const hash = await writeContractAsync({
        address:      getPayrollOrgRegistryAddress(),
        abi:          PAYROLL_ORG_REGISTRY_ABI,
        functionName: "createVault",
        args:         [orgId],
        gas:          3_000_000n,
      });
      setTxStatus({ status: "pending", hash });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status === "reverted") {
        setTxStatus({ status: "error", error: "Create vault reverted on-chain" });
        return;
      }
      setTxStatus({ status: "success", hash });
      return hash;
    } catch (err: any) {
      setTxStatus({ status: "error", error: err.shortMessage ?? err.message });
      throw err;
    }
  }, [writeContractAsync, publicClient]);

  return { createVault, txStatus };
}
