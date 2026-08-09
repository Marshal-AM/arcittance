/**
 * @deprecated Replaced by 11-remittance-full-flow.cy.ts (Payins → StableFX → Payouts).
 * Kept as a short smoke that AED / CCTP UI is gone from /remit.
 */
describe("StableFX remit UI (legacy AED path removed)", () => {
  it("does not show Pay in AED or CCTP speed on /remit", () => {
    cy.visit("/remit");
    cy.contains("Pay in AED").should("not.exist");
    cy.contains("CCTP speed").should("not.exist");
    cy.contains("Fund USDC").should("exist");
  });
});
