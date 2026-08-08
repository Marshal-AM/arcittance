"use client";

import {
  DESTINATION_CHAINS,
  TRANSFER_SPEED_FAST,
  TRANSFER_SPEED_STANDARD,
  TRANSFER_SPEED_LABELS,
  ARC_LOCAL_DOMAIN,
} from "@/lib/contracts/addresses";

interface Props {
  destinationChainId: number;
  onDestinationChange: (domain: number) => void;
  transferSpeed: number;
  onTransferSpeedChange: (speed: number) => void;
  disabled?: boolean;
}

export function ChainSelector({
  destinationChainId,
  onDestinationChange,
  transferSpeed,
  onTransferSpeedChange,
  disabled,
}: Props) {
  const isCrossChain = destinationChainId !== ARC_LOCAL_DOMAIN;
  const inputClass =
    "w-full rounded-xl border border-black/[0.07] bg-white px-3 py-2.5 text-sm text-[#111] appearance-none disabled:opacity-50";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] tracking-widest uppercase text-black/40">
          Destination Chain
        </label>
        <select
          value={destinationChainId}
          onChange={(e) => onDestinationChange(Number(e.target.value))}
          disabled={disabled}
          className={inputClass}
        >
          {DESTINATION_CHAINS.map((chain) => (
            <option key={chain.domain} value={chain.domain}>
              {chain.label} {chain.country ? `— ${chain.country}` : ""}
            </option>
          ))}
        </select>
      </div>

      {isCrossChain && (
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] tracking-widest uppercase text-black/40">
            CCTP Transfer Speed
          </label>
          <select
            value={transferSpeed}
            onChange={(e) => onTransferSpeedChange(Number(e.target.value))}
            disabled={disabled}
            className={inputClass}
          >
            <option value={TRANSFER_SPEED_FAST}>
              {TRANSFER_SPEED_LABELS[TRANSFER_SPEED_FAST]}
            </option>
            <option value={TRANSFER_SPEED_STANDARD}>
              {TRANSFER_SPEED_LABELS[TRANSFER_SPEED_STANDARD]}
            </option>
          </select>
          <p className="text-xs text-black/35">
            Cross-chain payroll uses CCTP burn/mint to the destination chain.
          </p>
        </div>
      )}
    </div>
  );
}
