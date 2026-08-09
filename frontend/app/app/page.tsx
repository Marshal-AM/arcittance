"use client";

import { useOptionalPayrollOrg } from "@/contexts/PayrollOrgContext";
import { useEmployeeCount }      from "@/hooks/usePayrollVault";
import { useMilestoneCount } from "@/hooks/useConditionalEscrow";
import { usePlanCount }      from "@/hooks/useSubscriptionManager";
import { VaultBalance }      from "@/components/VaultBalance";
import { StatCard }          from "@/components/StatCard";
import { useAccount }        from "wagmi";
import Link                  from "next/link";

export default function DashboardPage() {
  const { isConnected }          = useAccount();
  const { selectedVault }        = useOptionalPayrollOrg() ?? {};
  const { data: empCount }       = useEmployeeCount();
  const { data: milestoneCount } = useMilestoneCount();
  const { data: planCount }      = usePlanCount();

  return (
    <div className="flex flex-col gap-12">
      <section className="max-w-3xl">
        <span className="app-tag mb-4">Dashboard</span>
        <h1 className="mt-4 text-4xl md:text-5xl font-light tracking-tight leading-[1.05] text-[#111]">
          Programmable payments
          <br />on Arc Testnet
        </h1>
        <p className="mt-5 text-sm text-black/45 leading-relaxed max-w-xl">
          On-chain payroll, milestone escrow, subscription billing, and remittance — settled in USDC &amp; EURC via Circle.
        </p>
        {!isConnected && (
          <p className="mt-4 text-sm text-black/30">
            Connect your wallet to get started →
          </p>
        )}
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-black/[0.07] bg-white p-8 sm:col-span-2 hover:border-black/[0.15] transition-colors">
          <VaultBalance />
        </div>
        <StatCard
          label="Employees"
          value={selectedVault ? String(empCount ?? 0n) : "—"}
          sub={selectedVault ? "in active org vault" : "select org vault"}
        />
        <StatCard label="Milestones" value={String(milestoneCount ?? 0n)} sub="on-chain"      />
        <StatCard label="Plans"      value={String(planCount ?? 0n)}      sub="subscription" />
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            href: "/payroll", title: "Payroll Vault",
            desc: "Create your organisation and vault, then automate recurring payroll with Arc-local or CCTP routing.",
            cta: "Manage Payroll",
          },
          {
            href: "/escrow", title: "Milestone Escrow",
            desc: "Lock funds on contract creation, release on multi-party approval. No intermediary, no platform fees.",
            cta: "View Milestones",
          },
          {
            href: "/subscriptions", title: "Subscriptions",
            desc: "Create billing plans with subscriber-controlled caps. Batch-charge marketplace sellers in one keeper run.",
            cta: "Manage Subscriptions",
          },
          {
            href: "/remit", title: "Remittance",
            desc: "Consumer send-money flow with transparent fees, real-time settlement, and downloadable receipts.",
            cta: "Send Money",
          },
        ].map(({ href, title, desc, cta }) => (
          <Link
            key={href}
            href={href}
            className="group rounded-2xl border border-black/[0.07] bg-white p-8 flex flex-col gap-3 hover:border-black/[0.15] hover:bg-[#fafaf8] transition-all"
          >
            <h2 className="text-lg font-light text-[#111] group-hover:text-black transition-colors">
              {title}
            </h2>
            <p className="text-sm text-black/45 leading-relaxed flex-1">{desc}</p>
            <span className="text-xs tracking-widest text-black/40 group-hover:text-black/70 mt-2 transition-colors">
              {cta.toUpperCase()} →
            </span>
          </Link>
        ))}
      </section>

      <section className="flex justify-center">
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-full border border-black/[0.06] bg-black/[0.03] text-xs text-black/35 tracking-wide">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/80" />
          Arc Testnet · Chain ID 5042002 ·{" "}
          <a
            href="https://testnet.arcscan.app"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-black/60"
          >
            Arcscan Explorer
          </a>
        </div>
      </section>
    </div>
  );
}
