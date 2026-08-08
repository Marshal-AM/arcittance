"use client";

import { useEffect, useState } from "react";
import { isAddress } from "viem";

export type PayoutCurrency = "USDC" | "EURC";

export interface PayoutRecipientValue {
  address: string;
  chain: string;
  currency: PayoutCurrency;
  email?: string;
  nickname?: string;
  recipientId?: string;
}

interface Props {
  value: PayoutRecipientValue;
  onChange: (value: PayoutRecipientValue) => void;
  disabled?: boolean;
  onRegistered?: (recipientId: string) => void;
}

const DEFAULT_CHAINS: Record<PayoutCurrency, string[]> = {
  EURC: ["ARC", "AVAX", "BASE", "CRONOS", "ETH", "SOL", "XLM", "WORLDCHAIN"],
  USDC: ["ARC", "BASE", "ETH", "AVAX", "SOL", "ARB", "OP", "POLY"],
};

const CHAIN_LABELS: Record<string, string> = {
  ARC: "Arc Testnet",
  BASE: "Base",
  ETH: "Ethereum",
  AVAX: "Avalanche",
  SOL: "Solana",
  CRONOS: "Cronos",
  XLM: "Stellar",
  WORLDCHAIN: "World Chain",
  ARB: "Arbitrum",
  OP: "Optimism",
  POLY: "Polygon",
};

export function PayoutRecipientForm({ value, onChange, disabled, onRegistered }: Props) {
  const [chains, setChains] = useState<string[]>(DEFAULT_CHAINS[value.currency]);
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compliance, setCompliance] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/remit/recipients?currency=${value.currency}`);
        const data = await res.json();
        if (!cancelled && Array.isArray(data.chains) && data.chains.length > 0) {
          setChains(data.chains);
          if (!data.chains.includes(value.chain)) {
            onChange({ ...value, chain: data.chains[0], recipientId: undefined });
          }
        }
      } catch {
        setChains(DEFAULT_CHAINS[value.currency]);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.currency]);

  async function screenAddress(address: string) {
    if (!isAddress(address)) return;
    try {
      const res = await fetch(
        `/api/circle/compliance/screen?address=${encodeURIComponent(address)}`
      );
      const data = await res.json();
      setCompliance(data.allowed ? "Address cleared" : data.reason ?? "Blocked");
    } catch {
      setCompliance(null);
    }
  }

  async function registerRecipient() {
    if (!value.address || !value.chain) {
      setError("Address and chain required");
      return;
    }
    if (value.currency === "USDC" || value.currency === "EURC") {
      // EVM-style check for common chains; Solana/XLM skip viem check
      const evmChains = ["ARC", "ETH", "BASE", "AVAX", "ARB", "OP", "POLY", "CRONOS", "WORLDCHAIN"];
      if (evmChains.includes(value.chain.toUpperCase()) && !isAddress(value.address)) {
        setError("Invalid EVM address");
        return;
      }
    }
    setRegistering(true);
    setError(null);
    try {
      const res = await fetch("/api/remit/recipients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: value.address,
          chain: value.chain,
          currency: value.currency,
          email: value.email,
          nickname: value.nickname,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to register recipient");
      onChange({ ...value, recipientId: data.recipientId });
      onRegistered?.(data.recipientId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRegistering(false);
    }
  }

  const inputClass = "w-full rounded-xl border border-black/[0.07] bg-white px-3 py-2.5 text-sm text-[#111]";

  return (
    <div className="flex flex-col gap-3" data-testid="payout-recipient-form">
      <div>
        <label className="text-[11px] tracking-widest uppercase text-black/40">Payout currency</label>
        <select
          className={`${inputClass} mt-1.5`}
          disabled={disabled}
          data-testid="payout-currency"
          value={value.currency}
          onChange={(e) => {
            const currency = e.target.value as PayoutCurrency;
            const nextChains = DEFAULT_CHAINS[currency];
            onChange({
              ...value,
              currency,
              chain: nextChains[0],
              recipientId: undefined,
            });
          }}
        >
          <option value="EURC">EURC</option>
          <option value="USDC">USDC</option>
        </select>
      </div>

      <div>
        <label className="text-[11px] tracking-widest uppercase text-black/40">Destination chain</label>
        <select
          className={`${inputClass} mt-1.5`}
          disabled={disabled}
          data-testid="payout-chain"
          value={value.chain}
          onChange={(e) =>
            onChange({ ...value, chain: e.target.value, recipientId: undefined })
          }
        >
          {chains.map((c) => (
            <option key={c} value={c}>
              {CHAIN_LABELS[c] ?? c}
            </option>
          ))}
        </select>
        <p className="text-xs text-black/35 mt-1">
          Only chains that support {value.currency} payouts are listed.
        </p>
      </div>

      <div>
        <label className="text-[11px] tracking-widest uppercase text-black/40">Recipient address</label>
        <input
          className={`${inputClass} mt-1.5 font-mono`}
          placeholder="0x… or chain address"
          disabled={disabled}
          data-testid="payout-address"
          value={value.address}
          onChange={(e) => {
            onChange({ ...value, address: e.target.value, recipientId: undefined });
            setCompliance(null);
          }}
          onBlur={() => void screenAddress(value.address)}
        />
      </div>

      <div>
        <label className="text-[11px] tracking-widest uppercase text-black/40">
          Recipient email (Travel Rule)
        </label>
        <input
          type="email"
          className={`${inputClass} mt-1.5`}
          disabled={disabled}
          data-testid="payout-email"
          value={value.email ?? ""}
          onChange={(e) => onChange({ ...value, email: e.target.value })}
          placeholder="optional — required above reporting thresholds"
        />
      </div>

      {compliance && (
        <p
          className="text-xs"
          style={{
            color: compliance === "Address cleared" ? "var(--success)" : "var(--error)",
          }}
          data-testid="payout-compliance"
        >
          {compliance}
        </p>
      )}

      {!value.recipientId ? (
        <button
          type="button"
          disabled={disabled || registering || !value.address}
          onClick={() => void registerRecipient()}
          data-testid="register-recipient"
          className="w-full py-2 rounded-xl text-sm tracking-wide font-medium border border-black/[0.07] text-[#111] hover:border-black/20 transition-colors disabled:opacity-50"
        >
          {registering ? "Registering…" : "Register recipient"}
        </button>
      ) : (
        <p className="text-xs" style={{ color: "var(--success)" }} data-testid="recipient-registered">
          Recipient registered · {value.recipientId.slice(0, 12)}…
        </p>
      )}

      {error && (
        <p className="text-xs" style={{ color: "var(--error)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
