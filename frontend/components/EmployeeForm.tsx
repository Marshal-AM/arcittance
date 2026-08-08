"use client";

import { useState } from "react";
import { parseUnits, isAddress } from "viem";
import { useRegisterEmployee } from "@/hooks/usePayrollVault";
import {
  USDC_ADDRESS,
  TOKEN_DECIMALS,
  ROUTING_CCTP,
  TRANSFER_SPEED_FAST,
} from "@/lib/contracts/addresses";
import { ChainSelector } from "./ChainSelector";
import { TxStatusBadge } from "./TxStatusBadge";

interface Props { onSuccess?: () => void; onClose?: () => void; }

export function EmployeeForm({ onSuccess, onClose }: Props) {
  const [wallet,              setWallet]              = useState("");
  const [salary,              setSalary]              = useState("");
  const [intervalDays,        setIntervalDays]        = useState("30");
  const [cap,                 setCap]                 = useState("");
  const [destinationChainId,  setDestinationChainId]  = useState(6);
  const [transferSpeed,       setTransferSpeed]       = useState(TRANSFER_SPEED_FAST);
  const [errors,              setErrors]              = useState<Record<string, string>>({});

  const { registerEmployee, txStatus } = useRegisterEmployee();

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!isAddress(wallet))             e.wallet   = "Invalid Ethereum address";
    if (!salary || Number(salary) <= 0) e.salary   = "Salary must be > 0";
    if (!cap    || Number(cap)    <= 0) e.cap      = "Cap must be > 0";
    if (Number(cap) < Number(salary))   e.cap      = "Cap must be ≥ salary";
    if (Number(intervalDays) <= 0)      e.interval = "Interval must be > 0 days";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    try {
      await registerEmployee({
        wallet:             wallet as `0x${string}`,
        salary:             parseUnits(salary, TOKEN_DECIMALS),
        token:              USDC_ADDRESS,
        interval:           BigInt(Number(intervalDays) * 24 * 3600),
        cap:                parseUnits(cap, TOKEN_DECIMALS),
        destinationChainId,
        routingMethod:      ROUTING_CCTP,
        transferSpeed,
      });
      onSuccess?.();
    } catch {}
  }

  const inputClass = "w-full rounded-xl border border-black/[0.07] bg-white px-3 py-2.5 text-sm text-[#111]";
  const labelClass = "text-[11px] tracking-widest uppercase text-black/40";
  const errorClass = "text-xs mt-1";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div>
        <label className={labelClass}>Employee Wallet Address</label>
        <input className={`${inputClass} mt-1.5 font-mono`}
               placeholder="0x…" value={wallet} onChange={e => setWallet(e.target.value)} />
        {errors.wallet && <p className={errorClass} style={{ color: "var(--error)" }}>{errors.wallet}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Salary (USDC)</label>
          <input type="number" min="0" step="0.01" className={`${inputClass} mt-1.5`}
                 placeholder="100.00" value={salary} onChange={e => setSalary(e.target.value)} />
          {errors.salary && <p className={errorClass} style={{ color: "var(--error)" }}>{errors.salary}</p>}
        </div>
        <div>
          <label className={labelClass}>Approved Cap (USDC)</label>
          <input type="number" min="0" step="0.01" className={`${inputClass} mt-1.5`}
                 placeholder="1200.00" value={cap} onChange={e => setCap(e.target.value)} />
          {errors.cap && <p className={errorClass} style={{ color: "var(--error)" }}>{errors.cap}</p>}
        </div>
      </div>

      <div>
        <label className={labelClass}>Pay Interval (days)</label>
        <input type="number" min="1" className={`${inputClass} mt-1.5`}
               value={intervalDays} onChange={e => setIntervalDays(e.target.value)} />
        {errors.interval && <p className={errorClass} style={{ color: "var(--error)" }}>{errors.interval}</p>}
      </div>

      <ChainSelector
        destinationChainId={destinationChainId}
        onDestinationChange={setDestinationChainId}
        transferSpeed={transferSpeed}
        onTransferSpeedChange={setTransferSpeed}
        disabled={txStatus.status === "pending"}
      />

      <div className="flex items-center justify-between pt-2">
        <TxStatusBadge status={txStatus} />
        <div className="flex gap-3">
          {onClose && (
            <button type="button" onClick={onClose}
                    className="px-4 py-2 rounded-xl text-sm border border-black/[0.07] text-black/50 hover:border-black/20 transition-colors">
              Cancel
            </button>
          )}
          <button type="submit" disabled={txStatus.status === "pending"}
                  className="px-5 py-2 rounded-xl text-sm tracking-wide font-medium text-white disabled:opacity-50 transition-colors hover:bg-[#333]"
                  style={{ background: "#111" }}>
            {txStatus.status === "pending" ? "Registering…" : "Register Employee"}
          </button>
        </div>
      </div>
    </form>
  );
}
