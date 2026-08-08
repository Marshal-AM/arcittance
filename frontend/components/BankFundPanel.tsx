"use client";

import { useState } from "react";

interface Props {
  userId: string;
  onFunded?: (info: { ledgerId: string; availableLedgerUsdc: string }) => void;
}

export function BankFundPanel({ userId, onFunded }: Props) {
  const [amount, setAmount] = useState("50");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  async function runFund(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/remit/bank/fund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, amount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Bank fund failed");
      setResult(data);
      if (data.status === "minted" || data.availableLedgerUsdc) {
        onFunded?.({
          ledgerId: data.ledgerId,
          availableLedgerUsdc: String(data.availableLedgerUsdc ?? amount),
        });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4" data-testid="bank-fund-panel">
      <div>
        <h2 className="text-sm font-light tracking-tight text-[#111]">Fund via bank wire</h2>
        <p className="text-xs text-black/45 mt-1">
          Sandbox: link a mock bank, simulate a wire, mint USDC onchain to the facilitator (attributed to you).
        </p>
      </div>

      <form onSubmit={runFund} className="flex flex-col gap-3">
        <div>
          <label className="text-[11px] tracking-widest uppercase text-black/40">Amount (USD)</label>
          <input
            type="number"
            min="1"
            step="0.01"
            required
            data-testid="bank-amount"
            className="w-full mt-1.5 rounded-xl border border-black/[0.07] bg-white px-3 py-2.5 text-sm text-[#111]"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={loading}
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          data-testid="bank-fund-submit"
          className="w-full py-2.5 rounded-xl text-sm tracking-wide font-medium text-white disabled:opacity-50 transition-colors hover:bg-[#333]"
          style={{ background: "#111" }}
        >
          {loading ? "Wiring & minting…" : "Simulate wire & mint"}
        </button>
      </form>

      {error && (
        <p className="text-xs" style={{ color: "var(--error)" }} data-testid="bank-fund-error">
          {error}
        </p>
      )}

      {result && (
        <div
          className="rounded-2xl border border-black/[0.07] bg-white p-3 text-xs flex flex-col gap-1"
          data-testid="bank-fund-result"
        >
          <div className="flex justify-between">
            <span className="text-black/45">Status</span>
            <span className="font-light tracking-tight text-[#111]">{String(result.status)}</span>
          </div>
          {result.ledgerId != null && (
            <div className="flex justify-between">
              <span className="text-black/45">Ledger</span>
              <span className="font-mono text-[#111]">{String(result.ledgerId).slice(0, 8)}…</span>
            </div>
          )}
          {result.availableLedgerUsdc != null && (
            <div className="flex justify-between">
              <span className="text-black/45">Available (ledger)</span>
              <span className="font-light tracking-tight text-[#111]">{String(result.availableLedgerUsdc)} USDC</span>
            </div>
          )}
          {result.warning != null && (
            <p className="mt-1" style={{ color: "var(--warning)" }}>{String(result.warning)}</p>
          )}
          {result.message != null && (
            <p className="text-black/35 mt-1">{String(result.message)}</p>
          )}
        </div>
      )}
    </div>
  );
}
