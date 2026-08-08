"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAccount } from "wagmi";
import type { OrganizationDTO } from "@/lib/types";

const STORAGE_KEY = "arcittance.selectedPayrollOrgId";

interface PayrollOrgContextValue {
  organizations:        OrganizationDTO[];
  selectedOrgId:        string | null;
  selectedOrg:          OrganizationDTO | null;
  selectedVault:        `0x${string}` | null;
  loading:              boolean;
  selectOrg:            (orgId: string) => void;
  refreshOrganizations: () => Promise<void>;
}

const PayrollOrgContext = createContext<PayrollOrgContextValue | null>(null);

export function PayrollOrgProvider({ children }: { children: React.ReactNode }) {
  const { address, isConnected } = useAccount();
  const [organizations, setOrganizations] = useState<OrganizationDTO[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [loading, setLoading]             = useState(false);

  const refreshOrganizations = useCallback(async () => {
    if (!address) {
      setOrganizations([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/organizations?creator=${address}`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        setOrganizations([]);
        return;
      }
      const data = await res.json();
      setOrganizations(data.organizations ?? []);
    } catch {
      setOrganizations([]);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    if (!isConnected || !address) {
      setOrganizations([]);
      setSelectedOrgId(null);
      return;
    }
    refreshOrganizations();
  }, [isConnected, address, refreshOrganizations]);

  useEffect(() => {
    if (!isConnected) {
      setSelectedOrgId(null);
      return;
    }
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && organizations.some(o => o.id === stored)) {
      setSelectedOrgId(stored);
      return;
    }
    if (organizations.length > 0) {
      setSelectedOrgId(organizations[0].id);
    } else {
      setSelectedOrgId(null);
    }
  }, [organizations, isConnected]);

  const selectOrg = useCallback((orgId: string) => {
    setSelectedOrgId(orgId);
    localStorage.setItem(STORAGE_KEY, orgId);
  }, []);

  const selectedOrg = useMemo(
    () => organizations.find(o => o.id === selectedOrgId) ?? null,
    [organizations, selectedOrgId],
  );

  const selectedVault = useMemo(() => {
    if (!selectedOrg?.vaultCreated || !selectedOrg.vault) return null;
    return selectedOrg.vault as `0x${string}`;
  }, [selectedOrg]);

  const value = useMemo(
    () => ({
      organizations,
      selectedOrgId,
      selectedOrg,
      selectedVault,
      loading,
      selectOrg,
      refreshOrganizations,
    }),
    [
      organizations,
      selectedOrgId,
      selectedOrg,
      selectedVault,
      loading,
      selectOrg,
      refreshOrganizations,
    ],
  );

  return (
    <PayrollOrgContext.Provider value={value}>
      {children}
    </PayrollOrgContext.Provider>
  );
}

export function usePayrollOrg() {
  const ctx = useContext(PayrollOrgContext);
  if (!ctx) {
    throw new Error("usePayrollOrg must be used within PayrollOrgProvider");
  }
  return ctx;
}

export function useOptionalPayrollOrg() {
  return useContext(PayrollOrgContext);
}
