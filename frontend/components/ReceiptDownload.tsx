"use client";

import { useState } from "react";

interface Props {
  remittanceId: string;
  label?: string;
}

export function ReceiptDownload({ remittanceId, label = "Download receipt" }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError]       = useState<string | null>(null);

  async function handleDownload() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/remittances/${remittanceId}/receipt`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? `Receipt failed (${res.status})`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? `arcittance-receipt-${remittanceId}.pdf`;
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={handleDownload}
        disabled={loading}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm tracking-wide font-medium border border-black/[0.07] text-[#111] hover:border-black/20 transition-colors disabled:opacity-50"
      >
        ↓ {loading ? "Generating…" : label}
      </button>
      {error && (
        <p className="text-xs" style={{ color: "var(--error)" }}>{error}</p>
      )}
    </div>
  );
}
