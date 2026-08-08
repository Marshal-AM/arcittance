"use client";

import type { TxStatus } from "@/lib/types";
import { ARC_EXPLORER_URL } from "@/lib/contracts/addresses";

interface Props {
  status:        TxStatus;
  /** Fallback when status does not carry explorerBase */
  explorerBase?: string;
  pendingLabel?: string;
}

function isOnChainHash(hash: string | undefined | null): boolean {
  if (!hash) return false;
  return /^0x[a-fA-F0-9]{64}$/.test(hash);
}

function explorerUrl(base: string, hash: string | undefined | null): string | null {
  if (!isOnChainHash(hash)) return null;
  return `${base.replace(/\/$/, "")}/tx/${hash}`;
}

export function TxStatusBadge({ status, explorerBase = ARC_EXPLORER_URL, pendingLabel }: Props) {
  if (status.status === "idle") return null;

  const base =
    ("explorerBase" in status && status.explorerBase) || explorerBase;
  const chainLabel =
    ("chainLabel" in status && status.chainLabel) || "Arc";

  if (status.status === "pending") {
    const href = status.hash ? explorerUrl(base, status.hash) : null;
    const label =
      status.detail ??
      (href ? `Confirming on ${chainLabel}…` : (pendingLabel ?? "Waiting for wallet…"));
    return (
      <div className="flex flex-col gap-1 text-sm text-black/45">
        <div className="flex items-center gap-2">
          <span className="animate-spin inline-block w-4 h-4 border-2 rounded-full"
                style={{ borderColor: "#111", borderTopColor: "transparent" }} />
          {href ? (
            <a href={href} target="_blank" rel="noopener noreferrer" className="underline">
              {label}
            </a>
          ) : (
            <span>{label}</span>
          )}
        </div>
      </div>
    );
  }

  if (status.status === "success") {
    const hash = status.hash ?? "";
    const href = hash ? explorerUrl(base, hash) : null;
    return (
      <div className="flex flex-col gap-1 text-sm" style={{ color: "var(--success)" }}>
        <div className="flex items-center gap-2">
          <span>✓</span>
          {href ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-mono"
            >
              {chainLabel} tx {hash.slice(0, 10)}…
            </a>
          ) : hash ? (
            <span className="font-mono text-xs text-black/45">
              Circle ref {hash.slice(0, 10)}…
            </span>
          ) : (
            <span>{status.detail ?? "Success"}</span>
          )}
        </div>
        {!href && hash ? (
          <span className="text-xs text-black/35">
            Circle submitted — waiting for on-chain confirmation.
          </span>
        ) : null}
        {status.detail && hash ? (
          <span className="text-xs text-black/35">{status.detail}</span>
        ) : null}
      </div>
    );
  }

  if (status.status === "error") {
    return (
      <div className="text-sm" style={{ color: "var(--error)" }}>
        ✗ {status.error}
      </div>
    );
  }

  return null;
}
