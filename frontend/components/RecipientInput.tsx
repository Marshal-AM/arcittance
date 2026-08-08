"use client";

import { useState } from "react";
import { isAddress } from "viem";

interface Props {
  value: string;
  onChange: (value: string) => void;
  onResolved?: (address: string) => void;
  disabled?: boolean;
}

export function RecipientInput({ value, onChange, onResolved, disabled }: Props) {
  const [mode, setMode]       = useState<"address" | "handle">("address");
  const [handle, setHandle]   = useState("");
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState("");

  async function resolveHandle() {
    if (!handle.trim()) return;
    setResolving(true);
    setResolveError("");
    try {
      const res = await fetch(
        `/api/circle/user/resolve-handle?handle=${encodeURIComponent(handle.trim())}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Handle not found");
      onChange(data.address);
      onResolved?.(data.address);
    } catch (err: any) {
      setResolveError(err.message);
    } finally {
      setResolving(false);
    }
  }

  const inputClass = "w-full rounded-xl border border-black/[0.07] bg-white px-3 py-2.5 text-sm font-mono text-[#111]";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        {(["address", "handle"] as const).map((m) => (
          <button
            key={m}
            type="button"
            disabled={disabled}
            onClick={() => setMode(m)}
            className={`px-3 py-1 rounded-xl text-[11px] tracking-wide border transition-colors ${
              mode === m
                ? "border-black/15 bg-black/[0.04] text-[#111]"
                : "border-black/[0.07] text-black/45 hover:border-black/20"
            }`}
          >
            {m === "address" ? "Wallet address" : "Circle handle"}
          </button>
        ))}
      </div>

      {mode === "address" ? (
        <div>
          <input
            className={inputClass}
            placeholder="0x…"
            value={value}
            disabled={disabled}
            data-testid="recipient-address"
            onChange={(e) => onChange(e.target.value)}
          />
          {value && !isAddress(value) && (
            <p className="text-xs mt-1" style={{ color: "var(--error)" }}>
              Invalid Ethereum address
            </p>
          )}
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            className={`${inputClass} flex-1`}
            placeholder="@username or email"
            value={handle}
            disabled={disabled}
            onChange={(e) => setHandle(e.target.value)}
          />
          <button
            type="button"
            onClick={resolveHandle}
            disabled={disabled || resolving || !handle.trim()}
            className="px-4 py-2 rounded-xl text-sm tracking-wide font-medium text-white disabled:opacity-50 transition-colors hover:bg-[#333]"
            style={{ background: "#111" }}
          >
            {resolving ? "…" : "Resolve"}
          </button>
        </div>
      )}

      {resolveError && (
        <p className="text-xs" style={{ color: "var(--error)" }}>{resolveError}</p>
      )}
      {mode === "handle" && value && isAddress(value) && (
        <p className="text-xs font-mono text-black/35">
          Resolved: {value.slice(0, 10)}…{value.slice(-6)}
        </p>
      )}
    </div>
  );
}
