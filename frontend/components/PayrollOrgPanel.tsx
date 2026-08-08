"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { usePayrollOrg } from "@/contexts/PayrollOrgContext";
import { useCreateOrganization, useCreateOrgVault } from "@/hooks/usePayrollOrgRegistry";
import { TxStatusBadge } from "./TxStatusBadge";

export function PayrollOrgPanel() {
  const { isConnected } = useAccount();
  const {
    organizations,
    selectedOrgId,
    selectedOrg,
    selectedVault,
    loading,
    selectOrg,
    refreshOrganizations,
  } = usePayrollOrg();

  const [orgName, setOrgName] = useState("");
  const { createOrganization, txStatus: createOrgStatus } = useCreateOrganization();
  const { createVault, txStatus: createVaultStatus } = useCreateOrgVault();

  if (!isConnected) return null;

  async function handleCreateOrg(e: React.FormEvent) {
    e.preventDefault();
    if (!orgName.trim()) return;
    await createOrganization(orgName.trim()).catch(() => {});
    setOrgName("");
    await refreshOrganizations();
  }

  async function handleCreateVault() {
    if (!selectedOrgId) return;
    await createVault(BigInt(selectedOrgId)).catch(() => {});
    await refreshOrganizations();
  }

  const inputClass = "w-full rounded-xl border border-black/[0.07] bg-white px-3 py-2.5 text-sm text-[#111]";

  return (
    <div className="rounded-2xl border border-black/[0.07] bg-white p-6 flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-light tracking-tight text-[#111]">Organisation</h2>
        <p className="text-xs text-black/45 mt-1">
          Create an organisation, deploy your payroll vault, then register employees and run payroll.
        </p>
      </div>

      <form onSubmit={handleCreateOrg} className="flex flex-col sm:flex-row gap-3">
        <input
          className={`${inputClass} sm:flex-1`}
          placeholder="New organisation name"
          value={orgName}
          onChange={e => setOrgName(e.target.value)}
          maxLength={64}
        />
        <button
          type="submit"
          disabled={createOrgStatus.status === "pending" || !orgName.trim()}
          className="px-5 py-2.5 rounded-xl text-sm tracking-wide font-medium text-white disabled:opacity-50 whitespace-nowrap transition-colors hover:bg-[#333]"
          style={{ background: "#111" }}
        >
          Create Organisation
        </button>
      </form>
      <TxStatusBadge status={createOrgStatus} />

      {loading ? (
        <p className="text-sm text-black/35">Loading organisations…</p>
      ) : organizations.length === 0 ? (
        <p className="text-sm text-black/35">
          No organisations yet. Create one above to get started.
        </p>
      ) : (
        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="flex-1">
            <label className="text-[11px] tracking-widest uppercase text-black/40">Active organisation</label>
            <select
              className={`${inputClass} mt-1.5`}
              value={selectedOrgId ?? ""}
              onChange={e => selectOrg(e.target.value)}
            >
              {organizations.map(org => (
                <option key={org.id} value={org.id}>
                  {org.name}
                  {org.vaultCreated ? "" : " (no vault yet)"}
                </option>
              ))}
            </select>
          </div>

          {selectedOrg && !selectedOrg.vaultCreated && (
            <button
              type="button"
              onClick={handleCreateVault}
              disabled={createVaultStatus.status === "pending"}
              className="px-5 py-2.5 rounded-xl text-sm tracking-wide font-medium text-white disabled:opacity-50 whitespace-nowrap transition-colors hover:bg-[#333]"
              style={{ background: "#111" }}
            >
              Create Vault
            </button>
          )}
        </div>
      )}

      {createVaultStatus.status !== "idle" && (
        <TxStatusBadge status={createVaultStatus} />
      )}

      {selectedOrg?.vaultCreated && selectedVault && (
        <p className="text-xs font-mono text-black/35">
          Vault: {selectedVault.slice(0, 10)}…{selectedVault.slice(-6)}
        </p>
      )}
    </div>
  );
}
