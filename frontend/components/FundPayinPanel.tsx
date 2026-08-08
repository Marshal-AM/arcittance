"use client";

import { useEffect, useRef, useState } from "react";

export interface PayinView {
  id: string;
  paymentIntentId: string;
  amount: string;
  status: string;
  depositAddress: string | null;
  chain: string;
  settled?: boolean;
}

interface Props {
  userId: string;
  email?: string;
  disabled?: boolean;
  onSettled?: (payin: PayinView) => void;
}

export function FundPayinPanel({ userId, email, disabled, onSettled }: Props) {
  const [amount, setAmount] = useState("10");
  const [payin, setPayin] = useState<PayinView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const settledRef = useRef(false);

  useEffect(() => {
    if (!payin?.id || payin.settled) return;
    settledRef.current = false;

    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/remit/payins/${payin.id}`);
        const data = await res.json();
        if (!res.ok || cancelled) return;
        const next: PayinView = {
          id: data.id,
          paymentIntentId: data.paymentIntentId,
          amount: data.amount,
          status: data.status,
          depositAddress: data.depositAddress,
          chain: data.chain ?? "ARC",
          settled: data.settled === true,
        };
        setPayin(next);
        if (next.settled && !settledRef.current) {
          settledRef.current = true;
          onSettled?.(next);
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
  }, [payin?.id, payin?.settled, onSettled]);

  async function createPayin(e: React.FormEvent) {
    e.preventDefault();
    if (!amount || Number(amount) < 1) {
      setError("Minimum fund amount is 1 USDC");
      return;
    }
    setLoading(true);
    setError(null);
    settledRef.current = false;
    try {
      const res = await fetch("/api/remit/payins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, userId, email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create payment intent");
      setPayin({
        id: data.id,
        paymentIntentId: data.paymentIntentId,
        amount: data.amount,
        status: data.status,
        depositAddress: data.depositAddress,
        chain: data.chain ?? "ARC",
        settled: false,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  const waiting = payin && !payin.settled;
  const qrUrl = payin?.depositAddress
    ? `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(payin.depositAddress)}`
    : null;

  return (
    <div className="flex flex-col gap-4" data-testid="fund-payin-panel">
      <div>
        <h2 className="text-sm font-light tracking-tight text-[#111]">Fund your send</h2>
        <p className="text-xs text-black/45 mt-1">
          Create a Circle payment intent and send USDC on Arc to the deposit address.
        </p>
      </div>

      {!payin && (
        <form onSubmit={createPayin} className="flex flex-col gap-3">
          <div>
            <label className="text-[11px] tracking-widest uppercase text-black/40">Amount (USDC)</label>
            <input
              type="number"
              min="1"
              step="0.01"
              required
              disabled={disabled || loading}
              data-testid="fund-amount"
              className="w-full mt-1.5 rounded-xl border border-black/[0.07] bg-white px-3 py-2.5 text-sm text-[#111]"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <button
            type="submit"
            disabled={disabled || loading}
            data-testid="create-payin"
            className="w-full py-2.5 rounded-xl text-sm tracking-wide font-medium text-white disabled:opacity-50 transition-colors hover:bg-[#333]"
            style={{ background: "#111" }}
          >
            {loading ? "Creating payment intent…" : "Generate deposit address"}
          </button>
        </form>
      )}

      {error && (
        <p className="text-xs" style={{ color: "var(--error)" }} data-testid="fund-error">
          {error}
        </p>
      )}

      {payin && (
        <div
          className="rounded-2xl border border-black/[0.07] bg-white p-4 flex flex-col gap-3"
          data-testid="payin-status"
        >
          <div className="flex items-center gap-2">
            <div
              className="w-2 h-2 rounded-full"
              style={{
                background: payin.settled ? "var(--success)" : "var(--warning)",
              }}
            />
            <span className="text-sm font-light tracking-tight text-[#111]" data-testid="payin-status-label">
              {payin.settled ? "Received" : "Waiting for payment…"}
            </span>
          </div>

          <div className="flex justify-between text-sm">
            <span className="text-black/45">Expected</span>
            <span className="font-light tracking-tight text-[#111]">{payin.amount} USDC · {payin.chain}</span>
          </div>

          {payin.depositAddress ? (
            <>
              <div className="flex flex-col gap-1">
                <span className="text-[11px] tracking-widest uppercase text-black/40">Deposit address</span>
                <code
                  className="text-xs break-all font-mono p-2 rounded-xl border border-black/[0.07] bg-black/[0.02] text-[#111]"
                  data-testid="deposit-address"
                >
                  {payin.depositAddress}
                </code>
              </div>
              {qrUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={qrUrl}
                  alt="Deposit address QR"
                  width={160}
                  height={160}
                  className="mx-auto rounded-xl"
                  data-testid="deposit-qr"
                />
              )}
            </>
          ) : (
            <p className="text-xs text-black/35">
              Deposit address pending — polling Circle…
            </p>
          )}

          {waiting && (
            <p className="text-xs text-black/35">
              Status: {payin.status}. Send USDC on Arc, then wait for confirmation.
            </p>
          )}

          {payin.settled && (
            <button
              type="button"
              data-testid="fund-again"
              className="text-xs underline text-black/45 self-start hover:text-[#111] transition-colors"
              onClick={() => setPayin(null)}
            >
              Fund another amount
            </button>
          )}
        </div>
      )}
    </div>
  );
}
