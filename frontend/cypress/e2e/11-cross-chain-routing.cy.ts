/// <reference types="cypress" />

describe("Cross-chain routing UI", () => {
  beforeEach(() => {
    cy.visit("/payroll");
  });

  it("shows batch payout entry", () => {
    cy.contains("Batch Payout").should("be.visible");
  });

  it("employee form exposes CCTP speed for cross-chain", () => {
    cy.visit("/payroll");
    cy.contains("+ Add Employee").click();
    cy.contains("Destination Chain").should("be.visible");
    cy.get("select").first().select("6");
    cy.contains("CCTP Transfer Speed").should("be.visible");
  });

  it("remit page shows destination picker and fee transparency", () => {
    cy.intercept("POST", "/api/cross-chain/estimate-fee", {
      bridgeFeeUsdc: 0.05,
      breakdown: {
        amount: "100",
        protocolFee: "0.25",
        gasFee: "0.01",
        bridgeFee: "0.05",
        fxSpread: "0",
        totalFees: "0.31",
        netAmount: "99.69",
        settlementSeconds: 20,
      },
    }).as("estimateFee");

    cy.visit("/remit");
    cy.contains("Destination").should("be.visible");
    cy.get('input[type="number"]').type("100");
    cy.contains("Fee transparency").should("be.visible");
    cy.contains("Correspondent bank").should("be.visible");
  });
});
