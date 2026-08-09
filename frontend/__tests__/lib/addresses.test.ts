// frontend/__tests__/lib/addresses.test.ts

import {
  CHAIN_ID,
  USDC_ADDRESS,
  EURC_ADDRESS,
  TOKEN_CONFIG,
  TOKEN_DECIMALS,
  DESTINATION_CHAIN_NAMES,
  DESTINATION_CHAINS,
  getContractAddresses,
} from "@/lib/contracts/addresses";

describe("addresses.ts — Arc testnet constants", () => {
  it("CHAIN_ID is Arc testnet", () => {
    expect(CHAIN_ID).toBe(5042002);
  });

  it("USDC and EURC addresses are set", () => {
    expect(USDC_ADDRESS.toLowerCase()).toBe(
      "0x3600000000000000000000000000000000000000"
    );
    expect(EURC_ADDRESS.toLowerCase()).toBe(
      "0x89b50855aa3be2f677cd6303cec089b5f319d72a"
    );
  });

  it("TOKEN_CONFIG has 6 decimals for USDC and EURC", () => {
    expect(TOKEN_CONFIG.USDC.decimals).toBe(6);
    expect(TOKEN_CONFIG.EURC.decimals).toBe(6);
    expect(TOKEN_DECIMALS).toBe(6);
  });

  it("DESTINATION_CHAIN_NAMES has Arc local entry", () => {
    expect(DESTINATION_CHAIN_NAMES[0]).toBe("Arc (local)");
  });

  it("DESTINATION_CHAINS includes Base Sepolia domain 6", () => {
    const base = DESTINATION_CHAINS.find((c) => c.domain === 6);
    expect(base).toBeDefined();
    expect(base?.label).toBe("Base Sepolia");
  });

  it("DESTINATION_CHAINS includes Arbitrum and Avalanche", () => {
    const arb = DESTINATION_CHAINS.find((c) => c.domain === 3);
    const avax = DESTINATION_CHAINS.find((c) => c.domain === 1);
    expect(arb?.label).toBe("Arbitrum Sepolia");
    expect(avax?.label).toBe("Avalanche Fuji");
  });

  it("DESTINATION_CHAINS does not include Ethereum Sepolia", () => {
    expect(DESTINATION_CHAINS.some((c) => c.bridgeKitName === "Ethereum_Sepolia")).toBe(false);
    expect(DESTINATION_CHAINS.some((c) => c.domain === 1000)).toBe(false);
  });

  it("DESTINATION_CHAINS domain 0 is Arc-local only", () => {
    expect(DESTINATION_CHAINS.filter((c) => c.domain === 0)).toHaveLength(1);
    expect(DESTINATION_CHAINS.find((c) => c.domain === 0)?.label).toBe("Arc (local)");
  });

  it("getContractAddresses() throws if env var missing", () => {
    const saved = process.env.NEXT_PUBLIC_PAYROLL_ORG_REGISTRY_ADDRESS;
    delete process.env.NEXT_PUBLIC_PAYROLL_ORG_REGISTRY_ADDRESS;
    jest.resetModules();
    const { getContractAddresses: getAddrs } = require("@/lib/contracts/addresses");
    expect(() => getAddrs()).toThrow(/NEXT_PUBLIC_PAYROLL_ORG_REGISTRY_ADDRESS/);
    process.env.NEXT_PUBLIC_PAYROLL_ORG_REGISTRY_ADDRESS = saved;
    jest.resetModules();
  });
});
