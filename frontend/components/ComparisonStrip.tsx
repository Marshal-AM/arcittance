"use client";

import { compareToCorrespondentBank } from "@/lib/fees";

interface Props {
  amountUsdc: number;
}

export function ComparisonStrip({ amountUsdc }: Props) {
  if (!amountUsdc || amountUsdc <= 0) return null;

  const cmp = compareToCorrespondentBank(amountUsdc);

  return (
    <div
      className="rounded-2xl border border-black/[0.07] overflow-hidden bg-white"
      data-testid="comparison-strip"
    >
      <p className="text-xs px-5 pt-4 text-black/35 leading-relaxed">
        Static SWIFT / correspondent-bank reference (not a live FX conversion).
      </p>
      <div className="grid grid-cols-3 text-[10px] tracking-widest uppercase px-5 py-3 mt-2 border-t border-black/[0.04] bg-black/[0.02] text-black/35">
        <span />
        <span>Correspondent bank</span>
        <span className="text-black/60">Arcittance on Arc</span>
      </div>
      {[
        ["FX / transfer fee", `~${cmp.bankFeeUsdc.toFixed(2)} USDC (2–5%)`, `~${cmp.arcittanceFeeUsdc.toFixed(2)} USDC`],
        ["Settlement time", `${cmp.bankSettlementDays} days`, `~${cmp.arcittanceSettlementSeconds}s`],
        ["You save", "—", `~${cmp.savingsUsdc.toFixed(2)} USDC`],
      ].map(([label, bank, arcittance]) => (
        <div
          key={label}
          className="grid grid-cols-3 gap-2 px-5 py-3 text-sm border-t border-black/[0.04]"
        >
          <span className="text-black/45">{label}</span>
          <span className="text-black/55">{bank}</span>
          <span className="font-medium text-[#111]">{arcittance}</span>
        </div>
      ))}
    </div>
  );
}
