"use client";

import { useState } from "react";
import { useCircleKeeperCharge } from "@/hooks/useCircleKeeper";
import { TxStatusBadge } from "./TxStatusBadge";
import type { TxStatus } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  subscriptionIds: string[];
}

export function BatchSubscriptionChargeModal({ open, onClose, subscriptionIds }: Props) {
  const charge = useCircleKeeperCharge();
  const [txStatus, setTxStatus] = useState<TxStatus>({ status: "idle" });
  const [progress, setProgress] = useState(0);

  if (!open) return null;

  async function handleBatchCharge() {
    setTxStatus({ status: "pending" });
    setProgress(0);
    try {
      let lastHash = "";
      for (let i = 0; i < subscriptionIds.length; i++) {
        const result = await charge(BigInt(subscriptionIds[i]));
        if (result.status === "error") {
          setTxStatus(result);
          return;
        }
        if (result.status !== "idle") {
          lastHash = result.hash ?? lastHash;
        }
        setProgress(i + 1);
      }
      setTxStatus({ status: "success", hash: lastHash });
      onClose();
    } catch (err: any) {
      setTxStatus({ status: "error", error: err.message });
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: "rgba(0,0,0,0.35)" }}>
      <div className="w-full max-w-md rounded-2xl border border-black/[0.07] bg-white p-6 flex flex-col gap-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-light tracking-tight text-[#111]">Batch Subscription Charge</h2>
            <p className="text-xs text-black/45 mt-1">
              Charge {subscriptionIds.length} active subscriptions in one keeper run.
            </p>
          </div>
          <button onClick={onClose} className="text-black/35 hover:text-[#111] transition-colors">✕</button>
        </div>

        <ul className="text-sm font-mono text-black/45 max-h-40 overflow-y-auto">
          {subscriptionIds.map((id) => (
            <li key={id}>Subscription #{id}</li>
          ))}
        </ul>

        {txStatus.status === "pending" && (
          <p className="text-xs text-black/35">
            Charging {progress} / {subscriptionIds.length}…
          </p>
        )}

        <div className="flex items-center justify-between">
          <TxStatusBadge status={txStatus} />
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm border border-black/[0.07] text-black/50 hover:border-black/20 transition-colors">
              Cancel
            </button>
            <button onClick={handleBatchCharge}
                    disabled={txStatus.status === "pending" || subscriptionIds.length === 0}
                    className="px-5 py-2 rounded-xl text-sm tracking-wide font-medium text-white disabled:opacity-50 transition-colors hover:bg-[#333]"
                    style={{ background: "#111" }}>
              Charge All
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
