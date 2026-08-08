"use client";

import { useCharge, useRevoke }  from "@/hooks/useSubscriptionManager";
import { formatUnits }           from "viem";
import { TxStatusBadge }         from "./TxStatusBadge";
import { useState }              from "react";
import type { TxStatus }         from "@/lib/types";

interface Props {
  subscriptionId: string;
  planId:         string;
  chargeAmount:   string;
  interval:       string;
  nextChargeDue:  string;
  totalCharged:   string;
  approvedCap:    string;
  active:         boolean;
  isProvider:     boolean;
  isSubscriber:   boolean;
  title?:         string | null;
  description?:   string | null;
}

export function SubscriptionCard({
  subscriptionId, planId, chargeAmount, interval,
  nextChargeDue, totalCharged, approvedCap,
  active, isProvider, isSubscriber,
  title, description,
}: Props) {
  const chargeFn = useCharge();
  const revokeFn = useRevoke();
  const [txStatus, setTxStatus] = useState<TxStatus>({ status: "idle" });

  const chargeFormatted  = formatUnits(BigInt(chargeAmount), 6);
  const capFormatted     = formatUnits(BigInt(approvedCap), 6);
  const chargedFormatted = formatUnits(BigInt(totalCharged), 6);
  const nextDue          = new Date(Number(nextChargeDue) * 1000);
  const isChargeDue      = nextDue <= new Date();
  const capNum           = Number(approvedCap);
  const progress         = capNum > 0 ? (Number(totalCharged) / capNum) * 100 : 0;

  async function handleCharge() {
    setTxStatus({ status: "pending" });
    try {
      const hash = await chargeFn(BigInt(subscriptionId));
      setTxStatus({ status: "success", hash });
    } catch (err: any) {
      setTxStatus({ status: "error", error: err.shortMessage ?? err.message });
    }
  }

  async function handleRevoke() {
    setTxStatus({ status: "pending" });
    try {
      const hash = await revokeFn(BigInt(subscriptionId));
      setTxStatus({ status: "success", hash });
    } catch (err: any) {
      setTxStatus({ status: "error", error: err.shortMessage ?? err.message });
    }
  }

  return (
    <div className="rounded-2xl border border-black/[0.07] bg-white p-5 flex flex-col gap-4"
         style={{ opacity: active ? 1 : 0.5 }}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] tracking-widest uppercase text-black/40">
            Subscription #{subscriptionId} · Plan #{planId}
          </p>
          {title ? (
            <p className="text-lg font-light tracking-tight text-[#111] mt-1">{title}</p>
          ) : null}
          {description ? (
            <p className="text-xs text-black/45 mt-0.5 whitespace-pre-wrap">{description}</p>
          ) : null}
          <p className="text-xl font-light tracking-tight text-[#111] mt-1">
            {chargeFormatted}{" "}
            <span className="text-sm tracking-widest text-black/40">tUSDC</span>
            <span className="text-sm font-light text-black/45 ml-1">
              / {Math.round(Number(interval) / 3600 / 24)}d
            </span>
          </p>
        </div>
        <span className="px-3 py-1 rounded-full text-[11px] tracking-wide"
              style={active
                ? { background: "rgba(34,197,94,0.1)", color: "var(--success)" }
                : { background: "rgba(239,68,68,0.1)", color: "var(--error)" }}>
          {active ? "Active" : "Revoked"}
        </span>
      </div>

      {/* Cap progress bar */}
      <div>
        <div className="flex justify-between text-xs text-black/35 mb-1.5">
          <span>Charged: {chargedFormatted} tUSDC</span>
          <span>Cap: {capFormatted} tUSDC</span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden bg-black/[0.06]">
          <div className="h-full rounded-full transition-all duration-500"
               style={{
                 width:      `${Math.min(progress, 100)}%`,
                 background: progress > 80 ? "var(--warning)" : "#111",
               }} />
        </div>
      </div>

      {/* Next charge */}
      <p
        className={`text-xs ${isChargeDue ? "" : "text-black/35"}`}
        style={isChargeDue ? { color: "var(--warning)" } : undefined}
      >
        {isChargeDue ? "⚡ Charge due now" : `Next charge: ${nextDue.toLocaleDateString()}`}
      </p>

      {/* Actions */}
      {active && (
        <div className="flex flex-col gap-2">
          <TxStatusBadge status={txStatus} />
          <div className="flex gap-2">
            {isProvider && isChargeDue && (
              <button onClick={handleCharge} disabled={txStatus.status === "pending"}
                      className="flex-1 py-2 rounded-xl text-sm tracking-wide font-medium text-white disabled:opacity-50 transition-colors hover:bg-[#333]"
                      style={{ background: "#111" }}>
                Charge
              </button>
            )}
            {isSubscriber && (
              <button onClick={handleRevoke} disabled={txStatus.status === "pending"}
                      className="flex-1 py-2 rounded-xl text-sm tracking-wide font-medium disabled:opacity-50 border border-black/[0.07] bg-[#fafaf8] hover:border-black/20 transition-colors"
                      style={{ color: "var(--error)" }}>
                Revoke
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
