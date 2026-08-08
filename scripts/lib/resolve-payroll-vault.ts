/**
 * Resolve an org-owned PayrollVault address for scripts and integration tests.
 * Vaults are created via PayrollOrgRegistry — there is no global shared vault.
 */
export function requirePayrollVaultAddress(): string {
  const vault =
    process.env.PAYROLL_VAULT_ADDRESS ??
    process.argv.find((a) => a.startsWith("--vault="))?.split("=")[1];
  if (!vault) {
    throw new Error(
      "Set PAYROLL_VAULT_ADDRESS (from PayrollOrgRegistry.createVault) or pass --vault=0x…"
    );
  }
  return vault;
}
