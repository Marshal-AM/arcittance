"use client";

import { useEffect, useState } from "react";
import { TxStatusBadge } from "./TxStatusBadge";
import type { TxStatus } from "@/lib/types";

export type RemitLegStatus = "pending" | "complete" | "failed" | "idle";

export interface RemitLegs {
  /** Path A wallet or Path B bank→mint funding */
  funding?: {
    status: RemitLegStatus;
    path?: "A" | "B" | "B_MOCK";
    walletAddress?: string;
    bankRef?: string;
    mintTxHash?: string;
    amount?: string;
    aedAmount?: string;
    aedReceived?: string;
  };
  /** @deprecated Prefer funding — kept for older callers */
  payin?: {
    status: RemitLegStatus;
    paymentIntentId?: string;
    depositAddress?: string;
    amount?: string;
  };
  custody?: {
    status: RemitLegStatus;
    walletId?: string;
    balanceUsdc?: string;
  };
  fx?: {
    status: RemitLegStatus;
    tradeId?: string;
    settlementTxHash?: string;
    feeUsdc?: string;
    rate?: string;
  };
  /** Crypto (CCTP / Gateway / local / Payouts) or fiat bank */
  delivery?: {
    status: RemitLegStatus;
    mode?: "crypto" | "fiat";
    method?: "cctp" | "gateway" | "local" | "payouts" | "bank";
    payoutId?: string;
    txHash?: string;
    explorerBase?: string;
    chainLabel?: string;
    canRetry?: boolean;
  };
  /** @deprecated Prefer delivery */
  payout?: {
    status: RemitLegStatus;
    payoutId?: string;
    txHash?: string;
    canRetry?: boolean;
  };
}

interface Props {
  remittanceId?: string;
  legs: RemitLegs;
  payoutLocalId?: string;
  onPayoutComplete?: () => void;
  onRetryPayout?: () => void;
}

function LegRow({
  label,
  status,
  detail,
}: {
  label: string;
  status: RemitLegStatus;
  detail?: string;
}) {
  const color =
    status === "complete"
      ? "var(--success)"
      : status === "failed"
        ? "var(--error)"
        : status === "pending"
          ? "var(--warning)"
          : "var(--text-muted)";

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full" style={{ background: color }} />
        <span className="text-sm font-light tracking-tight text-[#111]">
          {label} · {status === "idle" ? "—" : status}
        </span>
      </div>
      {detail && (
        <p className="text-xs text-black/35 font-mono pl-4 break-all">{detail}</p>
      )}
    </div>
  );
}

function fundingLabel(legs: RemitLegs): { label: string; status: RemitLegStatus; detail?: string } {
  const f = legs.funding;
  if (f) {
    const path =
      f.path === "B_MOCK"
        ? "Bank-mock"
        : f.path === "B"
          ? "Bank wire → mint"
          : "Wallet balance";
    const detail = [
      f.walletAddress ? `wallet ${f.walletAddress.slice(0, 10)}…` : null,
      f.bankRef ? `bank ${f.bankRef}` : null,
      f.mintTxHash ? `mint ${f.mintTxHash.slice(0, 12)}…` : null,
      f.aedAmount ? `${f.aedAmount} AED` : null,
      f.aedReceived ? `${f.aedReceived} AED to bank` : null,
      f.amount ? `${f.amount} USDC` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    return { label: `1 · Fund (${path})`, status: f.status, detail: detail || undefined };
  }
  const p = legs.payin;
  if (p && p.status !== "idle") {
    return {
      label: "1 · Fund",
      status: p.status,
      detail: p.paymentIntentId
        ? `intent ${p.paymentIntentId.slice(0, 12)}… · ${p.amount ?? ""}`
        : p.amount,
    };
  }
  const c = legs.custody;
  if (c && c.status !== "idle") {
    return {
      label: "1 · Fund (wallet)",
      status: c.status,
      detail: c.walletId
        ? `wallet ${c.walletId} · ${c.balanceUsdc ?? "—"} USDC`
        : c.balanceUsdc
          ? `${c.balanceUsdc} USDC`
          : undefined,
    };
  }
  return { label: "1 · Fund", status: "idle" };
}

function deliveryLabel(legs: RemitLegs): { label: string; status: RemitLegStatus; detail?: string } {
  const d = legs.delivery ?? (legs.payout
    ? {
        status: legs.payout.status,
        payoutId: legs.payout.payoutId,
        txHash: legs.payout.txHash,
        canRetry: legs.payout.canRetry,
      }
    : undefined);
  if (!d) return { label: "3 · Delivery", status: "idle" };
  const method =
    d.method === "cctp"
      ? "CCTP"
      : d.method === "gateway"
        ? "Gateway"
        : d.method === "local"
          ? "Arc transfer"
          : d.method === "payouts"
            ? "Stablecoin Payouts"
            : d.method === "bank"
              ? "Bank wire"
              : d.mode === "fiat"
                ? "Fiat"
                : "Delivery";
  const detail = [
    d.payoutId ? `id ${d.payoutId.slice(0, 12)}…` : null,
    d.txHash ? `tx ${d.txHash.slice(0, 14)}…` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return { label: `3 · ${method}`, status: d.status, detail: detail || undefined };
}

export function SettlementTracker({
  remittanceId,
  legs,
  payoutLocalId,
  onPayoutComplete,
  onRetryPayout,
}: Props) {
  const [txStatus, setTxStatus] = useState<TxStatus>({ status: "idle" });
  const fund = fundingLabel(legs);
  const delivery = deliveryLabel(legs);
  const canRetry =
    legs.delivery?.canRetry ||
    legs.payout?.canRetry ||
    legs.delivery?.status === "failed" ||
    legs.payout?.status === "failed";

  useEffect(() => {
    if (
      !payoutLocalId ||
      legs.payout?.status === "complete" ||
      legs.payout?.status === "failed" ||
      legs.delivery?.status === "complete" ||
      legs.delivery?.status === "failed"
    ) {
      return;
    }

    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/remit/payouts/${payoutLocalId}`);
        const data = await res.json();
        if (!res.ok || cancelled) return;
        if (data.complete) {
          setTxStatus({ status: "success", hash: data.txHash ?? "" });
          onPayoutComplete?.();
        } else if (data.failed) {
          setTxStatus({
            status: "error",
            error: data.errorCode ?? "Payout failed — resubmit with a new idempotency key",
          });
        } else {
          setTxStatus({ status: "pending", hash: data.txHash ?? undefined });
        }
      } catch {
        // keep polling
      }
    };

    poll();
    const id = setInterval(poll, 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [payoutLocalId, legs.payout?.status, legs.delivery?.status, onPayoutComplete]);

  useEffect(() => {
    const hash = legs.delivery?.txHash ?? legs.payout?.txHash;
    const done =
      legs.delivery?.status === "complete" || legs.payout?.status === "complete";
    if (done && hash) {
      setTxStatus({
        status: "success",
        hash,
        explorerBase: legs.delivery?.explorerBase,
        chainLabel: legs.delivery?.chainLabel,
      });
    }
  }, [
    legs.delivery?.status,
    legs.delivery?.txHash,
    legs.delivery?.explorerBase,
    legs.delivery?.chainLabel,
    legs.payout?.status,
    legs.payout?.txHash,
  ]);

  return (
    <div
      className="rounded-2xl border border-black/[0.07] bg-white p-4 flex flex-col gap-3"
      data-testid="settlement-tracker"
    >
      <p className="text-[11px] tracking-widest uppercase text-black/40">
        Settlement · dual-rail{remittanceId ? ` · ${remittanceId.slice(0, 8)}…` : ""}
      </p>

      <LegRow label={fund.label} status={fund.status} detail={fund.detail} />
      <LegRow
        label="2 · StableFX"
        status={legs.fx?.status ?? "idle"}
        detail={
          legs.fx?.tradeId
            ? `trade ${legs.fx.tradeId.slice(0, 12)}…${legs.fx.feeUsdc ? ` · fee ${legs.fx.feeUsdc}` : ""}`
            : undefined
        }
      />
      <LegRow label={delivery.label} status={delivery.status} detail={delivery.detail} />

      <TxStatusBadge status={txStatus} />

      {canRetry && onRetryPayout && (
        <button
          type="button"
          onClick={onRetryPayout}
          data-testid="retry-payout"
          className="text-sm tracking-wide underline self-start text-[#111] hover:opacity-70 transition-opacity"
        >
          Resubmit payout (new idempotency key)
        </button>
      )}
    </div>
  );
}
