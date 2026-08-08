"use client";

import { useState } from "react";
import { parseUnits } from "viem";
import { useRegisterEmployee, useRunPayroll } from "@/hooks/usePayrollVault";
import { usePayrollOrg } from "@/contexts/PayrollOrgContext";
import {
  isCircleKeeperEnabled,
  useCircleKeeperBatchPayroll,
} from "@/hooks/useCircleKeeper";
import { TxStatusBadge } from "./TxStatusBadge";
import {
  ROUTING_CCTP,
  USDC_ADDRESS,
  TOKEN_DECIMALS,
  TRANSFER_SPEED_FAST,
} from "@/lib/contracts/addresses";
import type { TxStatus } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
}

interface BatchRecipient {
  wallet: string;
  amount: string;
  destinationChainId: number;
}

const PAY_INTERVAL = BigInt(30 * 24 * 3600);

export function BatchPayrollModal({ open, onClose }: Props) {
  const { selectedVault } = usePayrollOrg();
  const [recipients, setRecipients] = useState<BatchRecipient[]>([
    { wallet: "", amount: "", destinationChainId: 6 },
  ]);
  const [txStatus, setTxStatus] = useState<TxStatus>({ status: "idle" });
  const { registerEmployee } = useRegisterEmployee();
  const { runPayroll } = useRunPayroll();
  const keeperBatchPayroll = useCircleKeeperBatchPayroll();

  if (!open) return null;

  function updateRecipient(index: number, patch: Partial<BatchRecipient>) {
    setRecipients((prev) =>
      prev.map((r, i) => (i === index ? { ...r, ...patch } : r))
    );
  }

  function addRow() {
    setRecipients((prev) => [...prev, { wallet: "", amount: "", destinationChainId: 6 }]);
  }

  async function handleBatchRun() {
    const valid = recipients.filter((r) => r.wallet && r.amount);
    if (!valid.length || !selectedVault) return;

    setTxStatus({ status: "pending" });
    try {
      for (const r of valid) {
        const salary = parseUnits(r.amount, TOKEN_DECIMALS);
        await registerEmployee({
          wallet:             r.wallet as `0x${string}`,
          salary,
          token:              USDC_ADDRESS,
          interval:           PAY_INTERVAL,
          cap:                salary * 12n,
          destinationChainId: r.destinationChainId,
          routingMethod:      ROUTING_CCTP,
          transferSpeed:      TRANSFER_SPEED_FAST,
        });
      }

      if (isCircleKeeperEnabled()) {
        const result = await keeperBatchPayroll(selectedVault);
        setTxStatus(result);
        if (result.status === "success") onClose();
        return;
      }

      await runPayroll();
      setTxStatus({ status: "success" });
      onClose();
    } catch (err: any) {
      setTxStatus({ status: "error", error: err.message ?? String(err) });
    }
  }

  const total = recipients.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: "rgba(0,0,0,0.35)" }}>
      <div className="w-full max-w-2xl rounded-2xl border border-black/[0.07] bg-white p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-light tracking-tight text-[#111]">Batch Marketplace Payout</h2>
            <p className="text-xs text-black/45 mt-1">
              Register sellers with CCTP routing, then run keeper payroll
              {isCircleKeeperEnabled() ? " (facilitator)" : " (wagmi)"}.
            </p>
          </div>
          <button onClick={onClose} className="text-black/35 hover:text-[#111] transition-colors">✕</button>
        </div>

        <div className="flex flex-col gap-3">
          {recipients.map((r, i) => (
            <div key={i} className="grid grid-cols-3 gap-2">
              <input placeholder="Seller wallet 0x…" value={r.wallet}
                     onChange={(e) => updateRecipient(i, { wallet: e.target.value })}
                     className="col-span-2 rounded-xl border border-black/[0.07] bg-white px-3 py-2 text-sm font-mono text-[#111]" />
              <input type="number" min="0" step="0.01" placeholder="USDC"
                     value={r.amount}
                     onChange={(e) => updateRecipient(i, { amount: e.target.value })}
                     className="rounded-xl border border-black/[0.07] bg-white px-3 py-2 text-sm text-[#111]" />
            </div>
          ))}
          <button type="button" onClick={addRow}
                  className="text-sm text-[#111] tracking-wide self-start hover:opacity-70 transition-opacity">
            + Add recipient
          </button>
        </div>

        <div className="rounded-2xl border border-black/[0.07] bg-black/[0.02] p-3 text-sm">
          <p>Total batch: <span className="font-light tracking-tight text-[#111]">{total.toFixed(2)} USDC</span></p>
          <p className="text-xs text-black/35 mt-1">
            Vault owner registers employees on-chain, then facilitator completes CCTP settlement.
          </p>
        </div>

        <div className="flex items-center justify-between pt-2">
          <TxStatusBadge status={txStatus} />
          <div className="flex gap-2">
            <button onClick={onClose}
                    className="px-4 py-2 rounded-xl text-sm border border-black/[0.07] text-black/50 hover:border-black/20 transition-colors">
              Cancel
            </button>
            <button onClick={handleBatchRun}
                    disabled={txStatus.status === "pending"}
                    className="px-5 py-2 rounded-xl text-sm tracking-wide font-medium text-white disabled:opacity-50 transition-colors hover:bg-[#333]"
                    style={{ background: "#111" }}>
              Run Batch Payroll
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
