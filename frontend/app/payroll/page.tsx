"use client";

import { useState }         from "react";
import { useAccount }       from "wagmi";
import { VaultBalance }     from "@/components/VaultBalance";
import { PayrollRoster }    from "@/components/PayrollRoster";
import { EmployeeForm }     from "@/components/EmployeeForm";
import { PayrollOrgPanel }  from "@/components/PayrollOrgPanel";
import { BatchPayrollModal } from "@/components/BatchPayrollModal";
import { TxStatusBadge }    from "@/components/TxStatusBadge";
import { usePayrollOrg }    from "@/contexts/PayrollOrgContext";
import { useDeposit, useRunPayroll, useEmployeeCount } from "@/hooks/usePayrollVault";
import { USDC_ADDRESS, TOKEN_DECIMALS } from "@/lib/contracts/addresses";
import { parseUnits }       from "viem";

export default function PayrollPage() {
  const { isConnected }  = useAccount();
  const { selectedVault, selectedOrg } = usePayrollOrg();
  const [showForm,   setShowForm]   = useState(false);
  const [showBatch,  setShowBatch]  = useState(false);
  const [depositAmt, setDepositAmt] = useState("");
  const { deposit,    txStatus: depositStatus }  = useDeposit();
  const { runPayroll, txStatus: payrollStatus }  = useRunPayroll();
  const { data: empCount } = useEmployeeCount();

  const vaultReady = !!selectedVault;

  async function handleDeposit() {
    if (!depositAmt) return;
    await deposit(USDC_ADDRESS, parseUnits(depositAmt, TOKEN_DECIMALS)).catch(() => {});
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl md:text-4xl font-light tracking-tight text-[#111]">Payroll Vault</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {selectedOrg
              ? `${selectedOrg.name} — recurring salary with Arc-local or CCTP routing`
              : "Create an organisation and vault to run payroll on Arc testnet"}
          </p>
        </div>
        {isConnected && vaultReady && (
          <div className="flex gap-2">
            <button onClick={() => setShowBatch(true)}
                    className="px-4 py-2 rounded-xl text-sm tracking-wide border"
                    style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
              Batch Payout
            </button>
            <button onClick={() => setShowForm(v => !v)}
                    className="px-4 py-2 rounded-xl text-sm tracking-wide text-white"
                    style={{ background: "var(--dot-pink)" }}>
              + Add Employee
            </button>
          </div>
        )}
      </div>

      {isConnected ? (
        <PayrollOrgPanel />
      ) : (
        <div className="rounded-2xl border p-4 text-center text-sm text-[var(--text-muted)]"
             style={{ borderColor: "var(--border-subtle)" }}>
          Connect your wallet to create an organisation and payroll vault.
        </div>
      )}

      {!vaultReady && isConnected && (
        <div className="rounded-2xl border p-8 text-center"
             style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          <p className="text-[var(--text-secondary)]">
            {selectedOrg && !selectedOrg.vaultCreated
              ? "Create a vault for this organisation to continue."
              : "Create an organisation above, then deploy its vault."}
          </p>
        </div>
      )}

      {vaultReady && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-2xl border p-6 sm:col-span-2"
                 style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
              <VaultBalance />
            </div>
            <div className="rounded-2xl border p-6 flex flex-col justify-between"
                 style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
              <p className="text-xs text-[var(--text-muted)] uppercase tracking-widest mb-2">Employees</p>
              <p className="text-3xl font-light tracking-tight">{String(empCount ?? 0n)}</p>
              <button onClick={() => runPayroll().catch(() => {})}
                      disabled={payrollStatus.status === "pending"}
                      className="mt-4 w-full py-2 rounded-xl text-sm tracking-wide text-white disabled:opacity-50"
                      style={{ background: "var(--dot-pink)" }}>
                {payrollStatus.status === "pending" ? "Running…" : "Run Payroll"}
              </button>
              <p className="mt-2 text-xs text-[var(--text-muted)]">
                Cross-chain employees: after Arc payroll confirms, CCTP bridge runs automatically
                (~20s–3 min to destination).
              </p>
              <div className="mt-2"><TxStatusBadge status={payrollStatus} /></div>
            </div>
          </div>

          <div className="rounded-2xl border p-6"
               style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
            <h2 className="text-lg font-semibold mb-1">Fund Vault</h2>
            <p className="text-xs text-[var(--text-muted)] mb-4">
              Transfer USDC from your wallet into this org&apos;s payroll vault (MetaMask approve + deposit).
            </p>
            <div className="flex gap-3">
              <input type="number" min="0" step="0.01" placeholder="Amount in USDC"
                     value={depositAmt} onChange={e => setDepositAmt(e.target.value)}
                     className="flex-1 rounded-lg border px-3 py-2.5 text-sm"
                     style={{ background: "var(--bg-input)", borderColor: "var(--border)", color: "var(--text-primary)" }} />
              <button onClick={handleDeposit} disabled={depositStatus.status === "pending"}
                      className="px-5 py-2.5 rounded-xl text-sm tracking-wide text-white disabled:opacity-50"
                      style={{ background: "var(--dot-pink)" }}>
                Deposit
              </button>
            </div>
            <div className="mt-2"><TxStatusBadge status={depositStatus} /></div>
          </div>

          {showForm && (
            <div className="rounded-2xl border p-6"
                 style={{ background: "var(--bg-card)", borderColor: "var(--dot-pink)" }}>
              <h2 className="text-lg font-semibold mb-4">Register Employee</h2>
              <EmployeeForm
                onSuccess={() => setShowForm(false)}
                onClose={() => setShowForm(false)}
              />
            </div>
          )}

          <div>
            <h2 className="text-lg font-semibold mb-4">Employee Roster</h2>
            <PayrollRoster />
          </div>

          <BatchPayrollModal open={showBatch} onClose={() => setShowBatch(false)} />
        </>
      )}
    </div>
  );
}
