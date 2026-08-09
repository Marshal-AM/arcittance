"use client";

import { useApproveMilestone, useReclaimExpired } from "@/hooks/useConditionalEscrow";
import { formatUnits } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import { TxStatusBadge } from "./TxStatusBadge";
import { useState } from "react";
import type { TxStatus } from "@/lib/types";
import {
  isOnChainTxHash,
  pollMilestoneUntilSettled,
} from "@/lib/milestones/pollMilestone";

interface Props {
  id:                bigint;
  payer:             string;
  payee:             string;
  amount:            string;
  status:            "active" | "released" | "reclaimed" | "expired";
  disputeDeadline:   string;
  approvalCount:     string;
  approvalsRequired: string;
  isApprover:        boolean;
  title?:            string | null;
  description?:      string | null;
  onUpdated?:        () => void;
}

export function MilestoneCard({
  id, payer, payee, amount, status,
  disputeDeadline, approvalCount, approvalsRequired, isApprover,
  title, description,
  onUpdated,
}: Props) {
  const { address } = useAccount();
  const approveFn = useApproveMilestone();
  const reclaimFn = useReclaimExpired();
  const publicClient = usePublicClient();
  const [txStatus, setTxStatus] = useState<TxStatus>({ status: "idle" });
  const [settlementNote, setSettlementNote] = useState<string | null>(null);

  const amountFormatted = formatUnits(BigInt(amount), 6);
  const deadline = new Date(Number(disputeDeadline) * 1000);
  const isPastDeadline = deadline < new Date();
  const isPayer =
    !!address && address.toLowerCase() === payer.toLowerCase();
  const canReclaim =
    isPayer &&
    (status === "expired" || (status === "active" && isPastDeadline));
  // After deadline only the payer may reclaim — approvers cannot release post-expiry.
  const canApprove =
    isApprover && status === "active" && !isPastDeadline;
  const payerShort = `${payer.slice(0, 8)}…${payer.slice(-4)}`;
  const payeeShort = `${payee.slice(0, 8)}…${payee.slice(-4)}`;
  const expiredUnsettled =
    status === "expired" || (status === "active" && isPastDeadline);
  const showActions = canApprove || canReclaim;

  const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
    active:    { bg: "rgba(59,130,246,0.1)",  text: "var(--info)",    label: "Active"    },
    released:  { bg: "rgba(34,197,94,0.1)",   text: "var(--success)", label: "Released"  },
    reclaimed: { bg: "rgba(239,68,68,0.1)",   text: "var(--error)",   label: "Reclaimed" },
    expired:   { bg: "rgba(245,158,11,0.1)",  text: "var(--warning)", label: "Expired"   },
  };
  const style = STATUS_STYLES[status];

  async function confirmSettlementOnArc(txHash: `0x${string}`) {
    setTxStatus({ status: "pending", hash: txHash });
    const settled = await pollMilestoneUntilSettled(String(id));

    if (settled.status === "released") {
      setSettlementNote(
        `${amountFormatted} tUSDC released to payee ${payeeShort} on Arc testnet.`
      );
      setTxStatus({ status: "success", hash: txHash });
      onUpdated?.();
      return;
    }

    if (settled.status === "reclaimed") {
      setSettlementNote("Funds reclaimed by payer on Arc testnet.");
      setTxStatus({ status: "success", hash: txHash });
      onUpdated?.();
    }
  }

  async function handleApprove() {
    setTxStatus({ status: "pending" });
    setSettlementNote(null);
    try {
      const hash = await approveFn(id);
      setTxStatus({ status: "pending", hash });

      if (publicClient && isOnChainTxHash(hash)) {
        await publicClient.waitForTransactionReceipt({ hash });
        await confirmSettlementOnArc(hash);
      }
    } catch (err: any) {
      setTxStatus({ status: "error", error: err.shortMessage ?? err.message });
    }
  }

  async function handleReclaim() {
    setTxStatus({ status: "pending" });
    setSettlementNote(null);
    try {
      const hash = await reclaimFn(id);
      setTxStatus({ status: "pending", hash });

      if (publicClient && isOnChainTxHash(hash)) {
        await publicClient.waitForTransactionReceipt({ hash });
        await confirmSettlementOnArc(hash);
      }
    } catch (err: any) {
      setTxStatus({ status: "error", error: err.shortMessage ?? err.message });
    }
  }

  return (
    <div className="rounded-2xl border border-black/[0.07] bg-white p-5 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] tracking-widest uppercase text-black/40 mb-1">Milestone #{String(id)}</p>
          {title ? (
            <p className="text-lg font-light tracking-tight text-[#111] mb-0.5">{title}</p>
          ) : null}
          {description ? (
            <p className="text-xs text-black/45 mb-2 whitespace-pre-wrap">{description}</p>
          ) : null}
          <p className="text-2xl font-light tracking-tight text-[#111]">
            {amountFormatted}{" "}
            <span className="text-sm tracking-widest text-black/40">tUSDC</span>
          </p>
        </div>
        <span className="px-3 py-1 rounded-full text-[11px] tracking-wide"
              style={{ background: style.bg, color: style.text }}>
          {style.label}
        </span>
      </div>

      {/* Settlement confirmation */}
      {status === "released" && (
        <div className="rounded-xl px-3 py-2.5 text-xs"
             style={{ background: "rgba(34,197,94,0.1)", color: "var(--success)" }}>
          ✓ Payment complete — {amountFormatted} tUSDC sent to payee{" "}
          <span className="font-mono">{payeeShort}</span> on Arc testnet.
        </div>
      )}

      {status === "reclaimed" && (
        <div className="rounded-xl px-3 py-2.5 text-xs"
             style={{ background: "rgba(239,68,68,0.1)", color: "var(--error)" }}>
          Funds returned to payer on Arc testnet.
        </div>
      )}

      {settlementNote && (status === "active" || status === "expired") && (
        <div className="rounded-xl px-3 py-2.5 text-xs"
             style={{
               background: settlementNote.includes("reclaimed")
                 ? "rgba(239,68,68,0.1)"
                 : "rgba(34,197,94,0.1)",
               color: settlementNote.includes("reclaimed")
                 ? "var(--error)"
                 : "var(--success)",
             }}>
          ✓ {settlementNote}
        </div>
      )}

      {expiredUnsettled && (
        <div className="rounded-xl px-3 py-2.5 text-xs"
             style={{ background: "rgba(245,158,11,0.1)", color: "var(--warning)" }}>
          {canReclaim ? (
            <>Deadline passed — use <strong>Reclaim</strong> below to return funds to your wallet.</>
          ) : isApprover && !isPayer ? (
            <>
              Deadline passed. Only the payer{" "}
              <span className="font-mono">{payerShort}</span> can reclaim — you are an approver,
              not the wallet that locked funds. Connect as payer to reclaim; do not use Approve
              after the deadline.
            </>
          ) : (
            <>
              Deadline passed — payer{" "}
              <span className="font-mono">{payerShort}</span> can reclaim locked funds
              {!isPayer ? " (connect that wallet)." : "."}
            </>
          )}
        </div>
      )}

      {/* Parties */}
      <div className="space-y-1 text-xs text-black/45">
        <p><span className="text-black/35">Payer: </span>
           <span className="font-mono text-[#111]">{payer.slice(0, 8)}…{payer.slice(-4)}</span></p>
        <p><span className="text-black/35">Payee: </span>
           <span className="font-mono text-[#111]">{payeeShort}</span></p>
        <p><span className="text-black/35">Approvals: </span>
           <span className="text-[#111]">{approvalCount}/{approvalsRequired}</span></p>
        <p><span className="text-black/35">Deadline: </span>
           <span style={{ color: isPastDeadline ? "var(--warning)" : undefined }}
                 className={isPastDeadline ? undefined : "text-black/45"}>
             {deadline.toLocaleDateString()}
           </span></p>
      </div>

      {/* Actions — reclaim is payer-only after deadline; approve still allowed until reclaimed */}
      {showActions && (
        <div className="flex flex-col gap-2 pt-1">
          <TxStatusBadge
            status={txStatus}
            pendingLabel={
              canReclaim && !canApprove
                ? "Confirming reclaim on Arc…"
                : "Confirming on Arc…"
            }
          />
          <div className="flex gap-2">
            {canApprove && (
              <button onClick={handleApprove} disabled={txStatus.status === "pending"}
                      className="flex-1 py-2 rounded-xl text-sm tracking-wide font-medium text-white disabled:opacity-50 transition-colors hover:bg-[#333]"
                      style={{ background: "#111" }}>
                Approve & Release
              </button>
            )}
            {canReclaim && (
              <button onClick={handleReclaim} disabled={txStatus.status === "pending"}
                      className="flex-1 py-2 rounded-xl text-sm tracking-wide font-medium disabled:opacity-50 border border-black/[0.07] bg-[#fafaf8] text-[#111] hover:border-black/20 transition-colors"
                      data-testid="milestone-reclaim">
                Reclaim
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
