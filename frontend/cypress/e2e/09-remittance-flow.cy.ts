/// <reference types="cypress" />

/**
 * Remittance sign-in smoke — dual-rail Path A/B covered by 11-remittance-full-flow.cy.ts.
 */
describe("Remittance flow", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/circle/user/session", (req) => {
      if (req.body.email) {
        req.reply({ step: "otp_required", userId: "test-user-id" });
        return;
      }
      if (req.body.otp) {
        req.reply({
          step: "ready",
          userId: "test-user-id",
          userToken: "test-token",
          encryptionKey: "test-key",
          walletId: "test-wallet-id",
          address: "0x80568CF6687392bD74f15b1C600029499D97Ff40",
        });
        return;
      }
    }).as("session");
  });

  it("shows dual-rail framing and sign-in prompt", () => {
    cy.visit("/remit");
    cy.contains("Send Money").should("be.visible");
    cy.contains("Dual-rail").should("be.visible");
    cy.contains("Pay in AED").should("not.exist");
    cy.get('[data-testid="signin-prompt"]').should("exist");
  });
});
