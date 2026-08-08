"use client";

import { useCallback, useState } from "react";
import type { TxStatus } from "@/lib/types";

export interface FxRebalanceParams {
  fromCurrency: "USDC" | "EURC";
  toCurrency: "USDC" | "EURC";
  amount: string;
}

export interface FxRebalanceResult {
  fxQuoteId: string;
  stablefxTradeId: string;
  status: string;
  rate: string;
  feeUsdc: string;
  settlementTransactionHash?: string;
}

export function useFxRebalance() {
  const [txStatus, setTxStatus] = useState<TxStatus>({ status: "idle" });
  const [lastResult, setLastResult] = useState<FxRebalanceResult | null>(null);

  const rebalance = useCallback(async (params: FxRebalanceParams) => {
    setTxStatus({ status: "pending", detail: "Executing StableFX rebalance…" });
    try {
      const res = await fetch("/api/fx/rebalance", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(params),
      });
      const data = await res.json();
      if (!res.ok) {
        setTxStatus({ status: "error", error: data.error ?? "Rebalance failed" });
        throw new Error(data.error ?? "Rebalance failed");
      }
      const result: FxRebalanceResult = {
        fxQuoteId: data.fxQuoteId,
        stablefxTradeId: data.stablefxTradeId,
        status: data.status,
        rate: data.rate,
        feeUsdc: data.feeUsdc,
        settlementTransactionHash: data.settlementTransactionHash,
      };
      setLastResult(result);
      setTxStatus({
        status: "success",
        hash: data.settlementTransactionHash ?? data.stablefxTradeId,
        detail: `Rebalanced ${params.amount} ${params.fromCurrency} → ${params.toCurrency}`,
      });
      return result;
    } catch (err: any) {
      setTxStatus({ status: "error", error: err.message ?? String(err) });
      throw err;
    }
  }, []);

  return { rebalance, txStatus, lastResult };
}
