// frontend/cypress/e2e/01-navigation.cy.ts

describe("Navigation and page rendering", () => {
  beforeEach(() => {
    cy.visit("/app");
  });

  it("loads the dashboard page", () => {
    cy.url().should("eq", Cypress.config().baseUrl + "/app");
    cy.contains("Programmable").should("be.visible");
    cy.contains("payments").should("be.visible");
    cy.contains("Arc Testnet").should("be.visible");
  });

  it("shows all 4 stat cards on dashboard", () => {
    cy.contains("Vault Balance").should("be.visible");
    cy.contains("Employees").should("be.visible");
    cy.contains("Milestones").should("be.visible");
    cy.contains("Plans").should("be.visible");
  });

  it("shows feature link cards", () => {
    cy.contains("Payroll Vault").should("be.visible");
    cy.contains("Milestone Escrow").should("be.visible");
    cy.contains("Subscriptions").should("be.visible");
    cy.contains("Remittance").should("be.visible");
  });

  it("shows network badge with correct chain ID", () => {
    cy.contains("5042002").should("be.visible");
    cy.contains("Arc Testnet").should("be.visible");
    cy.contains("Arcscan Explorer").should("be.visible");
  });

  it("navigates to /payroll", () => {
    cy.get("nav").contains("Payroll").click();
    cy.url().should("include", "/payroll");
    cy.contains("Payroll Vault").should("be.visible");
    cy.contains("Employee Roster").should("be.visible");
  });

  it("navigates to /escrow", () => {
    cy.get("nav").contains("Milestones").click();
    cy.url().should("include", "/escrow");
    cy.contains("Milestone Escrow").should("be.visible");
  });

  it("navigates to /subscriptions", () => {
    cy.get("nav").contains("Subscriptions").click();
    cy.url().should("include", "/subscriptions");
    cy.contains("Subscription Manager").should("be.visible");
  });

  it("active nav link is highlighted on each page", () => {
    cy.get("nav").contains("Payroll").click();
    cy.get("nav").contains("Payroll")
      .should("have.css", "color")
      .and("not.eq", "rgb(136, 136, 136)");
  });

  it("shows Connect Wallet button when not connected", () => {
    cy.contains("Connect Wallet").should("be.visible");
  });

  it("/payroll shows connect wallet prompt when not connected", () => {
    cy.visit("/payroll");
    cy.contains("Connect your wallet").should("be.visible");
  });

  it("/escrow shows connect wallet prompt when not connected", () => {
    cy.visit("/escrow");
    cy.contains("Connect your wallet").should("be.visible");
  });

  it("/subscriptions shows connect wallet prompt when not connected", () => {
    cy.visit("/subscriptions");
    cy.contains("plans").click();
    cy.contains("Connect your wallet").should("be.visible");
  });

  it("PayrollRoster section is visible without wallet connection", () => {
    cy.visit("/payroll");
    cy.contains("Employee Roster").should("be.visible");
    cy.get("body").then($body => {
      if ($body.find("table").length > 0) {
        cy.get("table").should("be.visible");
      } else {
        cy.contains(/No employees|Employee Roster/, { timeout: 15_000 }).should("be.visible");
      }
    });
  });
});
