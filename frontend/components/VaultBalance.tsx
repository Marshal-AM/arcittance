"use client";

import { useVaultTokenBalance } from "@/hooks/usePayrollVault";
import { USDC_ADDRESS, TOKEN_DECIMALS } from "@/lib/contracts/addresses";
import { formatUnits } from "viem";

interface Props { className?: string; }

export function VaultBalance({ className = "" }: Props) {
  const { data: balance, isLoading } = useVaultTokenBalance(USDC_ADDRESS);

  const formatted = isLoading
    ? "—"
    : balance !== undefined
      ? Number(formatUnits(balance as bigint, TOKEN_DECIMALS)).toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : "0.00";

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <span className="text-[11px] tracking-widest uppercase text-black/40">
        Vault Balance
      </span>
      <p className="text-xs text-black/35 leading-relaxed">
        USDC held in your payroll vault — used when you run payroll.
      </p>
      <div className="flex items-baseline gap-2 mt-2">
        <span className="text-4xl font-light tracking-tight text-[#111]">
          {isLoading
            ? <span className="animate-pulse bg-black/[0.06] rounded-lg w-32 h-9 inline-block" />
            : formatted}
        </span>
        <span className="text-sm tracking-widest text-black/40">USDC</span>
      </div>
    </div>
  );
}
