// frontend/jest.setup.ts
import "@testing-library/jest-dom";

// Suppress wagmi SSR warning in test env
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false, media: query, onchange: null,
    addListener: jest.fn(), removeListener: jest.fn(),
    addEventListener: jest.fn(), removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock payroll org context — hooks tests use a fixed vault address
const MOCK_VAULT = "0x2Abb801011820682E7Daf8CC9C07fe5055D5E5Ef" as `0x${string}`;

jest.mock("@/contexts/PayrollOrgContext", () => ({
  PayrollOrgProvider: ({ children }: { children: React.ReactNode }) => children,
  usePayrollOrg: () => ({
    organizations:     [],
    selectedOrgId:     null,
    selectedOrg:       null,
    selectedVault:     MOCK_VAULT,
    loading:           false,
    selectOrg:         jest.fn(),
    refreshOrganizations: jest.fn(),
  }),
  useOptionalPayrollOrg: () => ({
    organizations:     [],
    selectedOrgId:     null,
    selectedOrg:       null,
    selectedVault:     MOCK_VAULT,
    loading:           false,
    selectOrg:         jest.fn(),
    refreshOrganizations: jest.fn(),
  }),
}));

// Mock next/navigation for App Router
jest.mock("next/navigation", () => ({
  useRouter:       () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname:     () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
