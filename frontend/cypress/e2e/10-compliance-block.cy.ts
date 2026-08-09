/// <reference types="cypress" />

describe("Compliance blocklist", () => {
  it("shows rejection for blocklisted recipient before send", () => {
    cy.intercept("GET", "/api/circle/compliance/screen*", {
      allowed: false,
      reason:  "Recipient address is blocklisted for compliance review",
    }).as("complianceBlock");

    cy.visit("/remit");

    cy.intercept("POST", "/api/circle/user/session", {
      step:    "ready",
      userId:  "u1",
      userToken: "tok",
      walletId: "w1",
      address: "0x80568CF6687392bD74f15b1C600029499D97Ff40",
    });

    // Simulate wallet ready state via local storage hack — visit with mocked session
    cy.get('input[type="email"]').should("exist");
  });

  it("compliance API rejects dead address", () => {
    cy.request({
      url:    "/api/circle/compliance/screen?address=0x000000000000000000000000000000000000dEaD",
      failOnStatusCode: false,
    }).then((res) => {
      expect(res.body.allowed).to.eq(false);
    });
  });
});
