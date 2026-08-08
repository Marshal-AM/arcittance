"use client";

import { DESTINATION_CHAINS } from "@/lib/contracts/addresses";

interface Props {
  value: number;
  onChange: (domain: number) => void;
  disabled?: boolean;
}

export function DestinationPicker({ value, onChange, disabled }: Props) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] tracking-widest uppercase text-black/40">
        Destination
      </label>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        data-testid="destination-chain"
        className="w-full rounded-xl border border-black/[0.07] bg-white px-3 py-2.5 text-sm text-[#111] disabled:opacity-50"
      >
        {DESTINATION_CHAINS.map((chain) => (
          <option key={chain.domain} value={chain.domain}>
            {chain.label} — {chain.country}
          </option>
        ))}
      </select>
    </div>
  );
}
