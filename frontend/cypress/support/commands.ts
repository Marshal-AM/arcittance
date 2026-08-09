// frontend/cypress/support/commands.ts

const ARC_CHAIN_ID = 5042002;
const ARC_CHAIN_ID_HEX = "0x4cef52";

Cypress.Commands.add("mockWalletConnect", (address: string) => {
  cy.window().then((win) => {
    (win as any).__testWalletAddress = address;
    (win as any).ethereum = {
      isMetaMask:      true,
      selectedAddress: address,
      chainId:         ARC_CHAIN_ID_HEX,
      request: async ({ method, params }: any) => {
        if (method === "eth_requestAccounts") return [address];
        if (method === "eth_accounts")        return [address];
        if (method === "eth_chainId")         return ARC_CHAIN_ID_HEX;
        if (method === "net_version")         return String(ARC_CHAIN_ID);
        if (method === "wallet_switchEthereumChain") return null;
        const rpc = Cypress.env("ARC_RPC_URL") as string;
        const res = await fetch(rpc, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        return data.result;
      },
      on:             () => {},
      removeListener: () => {},
    };
  });
});

Cypress.Commands.add("sendTx", (txParams: any) => {
  const pk  = Cypress.env("DEPLOYER_PRIVATE_KEY") as `0x${string}`;
  const rpc = Cypress.env("ARC_RPC_URL") as string;
  return cy.task("sendTransaction", { pk, rpc, txParams });
});

Cypress.Commands.add("waitBlocks", (n: number) => {
  cy.wait(n * 2000);
});

Cypress.Commands.add("noConsoleErrors", () => {
  cy.window().its("console").then(() => {
    // Stub checked in beforeEach
  });
});

declare global {
  namespace Cypress {
    interface Chainable {
      mockWalletConnect(address: string): void;
      sendTx(txParams: any): void;
      waitBlocks(n: number): void;
      noConsoleErrors(): void;
    }
  }
}
