"use client";

import { useCallback, useEffect, useState } from "react";

export interface CustodyBalanceView {
  walletId: string;
  availableUsdc: string;
  availableEurc: string;
}

interface Props {
  userId: string | null;
  refreshKey?: number;
}

export function CustodyBalance({ userId, refreshKey = 0 }: Props) {
  const [balance, setBalance] = useState<CustodyBalanceView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) {
      setBalance(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/remit/custody/balance?userId=${encodeURIComponent(userId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load custody balance");
      setBalance({
        walletId: data.walletId,
        availableUsdc: data.availableUsdc ?? "0",
        availableEurc: data.availableEurc ?? "0",
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setBalance(null);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  if (!userId) return null;

  return (
    <div
      className="rounded-2xl border border-black/[0.07] bg-white p-4 flex flex-col gap-2"
      data-testid="custody-balance"
    >
      <div className="flex items-center justify-between">
        <p className="text-[11px] tracking-widest uppercase text-black/40">
          Custodied balance
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="text-xs text-black/45 underline hover:text-[#111] transition-colors"
          data-testid="refresh-balance"
        >
          Refresh
        </button>
      </div>
      {loading && (
        <p className="text-sm text-black/45 animate-pulse">Loading…</p>
      )}
      {error && (
        <p className="text-xs" style={{ color: "var(--error)" }} data-testid="balance-error">
          {error}
        </p>
      )}
      {balance && !loading && (
        <>
          <div className="flex justify-between text-sm">
            <span className="text-black/45">USDC</span>
            <span className="font-light tracking-tight text-[#111]" data-testid="balance-usdc">
              {balance.availableUsdc}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-black/45">EURC</span>
            <span className="font-light tracking-tight text-[#111]" data-testid="balance-eurc">
              {balance.availableEurc}
            </span>
          </div>
          <p className="text-xs text-black/35 font-mono">
            wallet {balance.walletId}
          </p>
        </>
      )}
    </div>
  );
}
