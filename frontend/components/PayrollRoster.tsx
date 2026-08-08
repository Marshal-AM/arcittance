"use client";

import { useEmployeeCount, useEmployee } from "@/hooks/usePayrollVault";
import {
  ARC_LOCAL_DOMAIN,
  DESTINATION_CHAIN_NAMES,
  ROUTING_CCTP,
  ROUTING_METHOD_LABELS,
} from "@/lib/contracts/addresses";
import { normalizeEmployee } from "@/lib/payroll/normalizeEmployee";
import { formatUnits } from "viem";

function EmployeeRow({ id }: { id: bigint }) {
  const { data: emp, isLoading } = useEmployee(id);

  if (isLoading) return (
    <tr>
      <td colSpan={6} className="px-4 py-3">
        <div className="animate-pulse h-4 rounded-xl bg-black/[0.06]" />
      </td>
    </tr>
  );
  if (!emp) return null;

  const e         = normalizeEmployee(emp as Record<string, unknown>, id);
  const nextDue   = new Date(Number(e.nextPaymentDue) * 1000);
  const isDue     = nextDue <= new Date();
  const chainName = DESTINATION_CHAIN_NAMES[e.destinationChainId]
                    ?? `Domain ${e.destinationChainId}`;
  const routeLabel = e.destinationChainId === ARC_LOCAL_DOMAIN
    ? chainName
    : `${chainName} · ${ROUTING_METHOD_LABELS[e.routingMethod] ?? ROUTING_METHOD_LABELS[ROUTING_CCTP]}`;

  return (
    <tr className="border-b border-black/[0.04] hover:bg-black/[0.02] transition-colors"
        style={{ opacity: e.active ? 1 : 0.4 }}>
      <td className="px-4 py-3 font-mono text-sm text-black/45">#{String(id)}</td>
      <td className="px-4 py-3 font-mono text-sm text-[#111]">
        {e.wallet.slice(0, 8)}…{e.wallet.slice(-4)}
      </td>
      <td className="px-4 py-3 text-sm">
        <span className="font-light tracking-tight text-[#111]">{formatUnits(e.salaryAmount, 6)}</span>
        <span className="text-xs ml-1 tracking-widest text-black/40">USDC</span>
      </td>
      <td
        className="px-4 py-3 text-xs"
        style={{ color: e.destinationChainId === ARC_LOCAL_DOMAIN ? "rgba(0,0,0,0.45)" : "var(--info)" }}
      >
        {routeLabel}
      </td>
      <td className="px-4 py-3 text-xs">
        <span style={{ color: isDue ? "var(--warning)" : undefined }}
              className={isDue ? undefined : "text-black/45"}>
          {isDue ? "Due now" : nextDue.toLocaleDateString()}
        </span>
      </td>
      <td className="px-4 py-3">
        <span className="text-[11px] tracking-wide px-2 py-0.5 rounded-full"
              style={{
                background: e.active ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
                color:      e.active ? "var(--success)"      : "var(--error)",
              }}>
          {e.active ? "Active" : "Inactive"}
        </span>
      </td>
    </tr>
  );
}

export function PayrollRoster() {
  const { data: count, isLoading } = useEmployeeCount();
  const total = Number(count ?? 0n);

  if (isLoading) return (
    <div className="animate-pulse space-y-3">
      {[1, 2, 3].map(i => (
        <div key={i} className="h-12 rounded-xl bg-black/[0.04]" />
      ))}
    </div>
  );

  if (total === 0) return (
    <div className="py-16 text-center rounded-2xl border border-black/[0.07] bg-white">
      <p className="text-black/45">No employees registered yet.</p>
    </div>
  );

  return (
    <div className="overflow-x-auto rounded-2xl border border-black/[0.07] bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-black/[0.07] bg-black/[0.02]">
            {["ID", "Wallet", "Salary", "Route", "Next Due", "Status"].map(h => (
              <th key={h} className="px-4 py-3 text-left text-[11px] tracking-widest uppercase text-black/40">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: total }, (_, i) => (
            <EmployeeRow key={i} id={BigInt(i)} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
