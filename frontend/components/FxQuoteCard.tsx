"use client";

import { useEffect, useRef, useState } from "react";

export interface FxQuoteView {
  id: string;
  fromCurrency: string;
  fromAmount: string;
  toCurrency: string;
  toAmount: string;
  rate: string;
  fee: string;
  fxSpreadBps: number;
  expiresAt: string;
  pair: string;
}

interface Props {
  quote: FxQuoteView | null;
  loading?: boolean;
  error?: string | null;
  onExpired?: () => void;
}

export function FxQuoteCard({ quote, loading, error, onExpired }: Props) {
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const expiredNotified = useRef<string | null>(null);

  useEffect(() => {
    expiredNotified.current = null;
    if (!quote?.expiresAt) {
      setRemainingMs(null);
      return;
    }
    const tick = () => {
      const ms = new Date(quote.expiresAt).getTime() - Date.now();
      setRemainingMs(ms);
      // Fire once per quote id — sandbox TTL is ~3s; do not spam refresh every 250ms
      if (ms <= 0 && expiredNotified.current !== quote.id) {
        expiredNotified.current = quote.id;
        onExpired?.();
      }
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [quote?.expiresAt, quote?.id, onExpired]);

  if (loading) {
    return (
      <div
        className="rounded-2xl border border-black/[0.07] bg-white p-3 text-xs text-black/45 animate-pulse"
        data-testid="fx-quote-loading"
      >
        Fetching live StableFX quote…
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="rounded-2xl border p-3 text-xs"
        style={{ borderColor: "var(--error)", color: "var(--error)" }}
        data-testid="fx-quote-error"
      >
        {error}
      </div>
    );
  }

  if (!quote) return null;

  const expired = remainingMs != null && remainingMs <= 0;
  const seconds = remainingMs != null ? Math.max(0, Math.ceil(remainingMs / 1000)) : null;

  return (
    <div
      className="rounded-2xl border border-black/[0.07] bg-white p-4 flex flex-col gap-2"
      style={{
        borderColor: expired ? "var(--warning)" : undefined,
      }}
      data-testid="fx-quote-card"
    >
      <p className="text-[11px] tracking-widest uppercase text-black/40">
        Indicative StableFX · {quote.pair}
      </p>
      <div className="flex justify-between text-sm">
        <span className="text-black/45">You send</span>
        <span className="font-light tracking-tight text-[#111]">
          {quote.fromAmount} {quote.fromCurrency}
        </span>
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-black/45">FX rate</span>
        <span className="font-light tracking-tight text-[#111]">{quote.rate}</span>
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-black/45">StableFX fee</span>
        <span className="font-light tracking-tight text-[#111]">
          {quote.fee} ({quote.fxSpreadBps} bps)
        </span>
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-black/45">You receive</span>
        <span className="font-light tracking-tight text-[#111]">
          {quote.toAmount} {quote.toCurrency}
        </span>
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-black/45">Preview TTL</span>
        <span
          className={`font-light tracking-tight ${expired ? "" : "text-black/45"}`}
          style={{ color: expired ? "var(--warning)" : undefined }}
          data-testid="fx-quote-expiry"
        >
          {expired
            ? "Refreshing preview…"
            : seconds != null
              ? `${seconds}s · Convert locks a fresh quote`
              : "—"}
        </span>
      </div>
    </div>
  );
}
