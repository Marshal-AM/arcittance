/**
 * Phase 10 dual-rail remittance (intercepted sandbox APIs).
 * Covers Path A wallet + local/CCTP/Gateway UI, Path B bank + Payouts, fiat delivery.
 */
describe("11 remittance dual-rail full flow", () => {
  const quoteId = "quote-2222-2222-2222-222222222222";
  const remittanceId = "remit-3333-3333-3333-333333333333";
  const payoutLocalId = "payout-row-4444-4444-4444-44444444";
  const recipientId = "addrbook-5555-5555-5555-55555555";
  const ledgerId = "ledger-6666-6666-6666-666666666666";

  function injectWallet() {
    cy.window().then((win) => {
      (win as any).__ARCITTANCE_TEST_REMIT_WALLET__ = {
        userId: "test-user",
        userToken: "tok",
        encryptionKey: "enc",
        walletId: "w1",
        address: "0x2222222222222222222222222222222222222222",
      };
      win.dispatchEvent(new Event("arcittance:test-remit-wallet"));
    });
  }

  beforeEach(() => {
    cy.intercept("GET", "**/api/circle/compliance/screen*", {
      statusCode: 200,
      body: { allowed: true, reason: null },
    }).as("compliance");

    cy.intercept("GET", "**/api/remit/wallet/balance*", {
      statusCode: 200,
      body: { usdc: "50.00", eurc: "0", walletId: "w1" },
    }).as("walletBalance");

    cy.intercept("POST", "**/api/remit/bank/fund", {
      statusCode: 200,
      body: {
        ledgerId,
        status: "minted",
        availableLedgerUsdc: "50.00",
        mintTxHash: "0x" + "11".repeat(32),
        bankAccountId: "bank-1",
      },
    }).as("bankFund");

    cy.intercept("GET", "**/api/remit/bank-mock/quote", {
      statusCode: 200,
      body: {
        aedToUsd: 0.2723,
        usdToAed: 3.6724,
        source: "test",
        fetchedAt: new Date().toISOString(),
      },
    }).as("bankMockQuote");

    cy.intercept("POST", "**/api/remit/bank-mock/fund", {
      statusCode: 200,
      body: {
        ledgerId: "ledger-mock-1",
        status: "minted",
        aedAmount: "100",
        usdcAmount: "27.23",
        rate: 0.2723,
        usdToAed: 3.6724,
        recipientAddress: "0x1111111111111111111111111111111111111111",
        chain: "ARC",
        availableLedgerUsdc: "27.23",
        treasuryTxHash: "0x" + "22".repeat(32),
      },
    }).as("bankMockFund");

    cy.intercept("POST", "**/api/fx/quotes", {
      statusCode: 200,
      body: {
        id: quoteId,
        stablefxQuoteId: "sfx-q-1",
        pair: "USDC/EURC",
        fromCurrency: "USDC",
        fromAmount: "10",
        toCurrency: "EURC",
        toAmount: "8.95",
        rate: "1.1167",
        fee: "0.022388",
        fxSpreadBps: 22,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        status: "quoted",
      },
    }).as("fxQuote");

    cy.intercept("POST", "**/api/fx/execute", {
      statusCode: 200,
      body: {
        quoteId,
        stablefxTradeId: "sfx-trade-1",
        status: "completed",
        settlementTransactionHash: "0x" + "ab".repeat(32),
        feeUsdc: "0.022388",
        fromCurrency: "USDC",
        toCurrency: "EURC",
        fromAmount: "10",
        toAmount: "8.95",
      },
    }).as("fxExecute");

    cy.intercept("POST", "**/api/remit/recipients", {
      statusCode: 200,
      body: {
        recipientId,
        status: "active",
        chain: "BASE",
        address: "0x1111111111111111111111111111111111111111",
      },
    }).as("registerRecipient");

    cy.intercept("POST", "**/api/remittances", {
      statusCode: 200,
      body: {
        remittance: { id: remittanceId, status: "pending", amount: "10000000" },
      },
    }).as("createRemittance");

    cy.intercept("POST", "**/api/remit/payouts", {
      statusCode: 200,
      body: {
        id: payoutLocalId,
        payoutId: "circle-payout-1",
        status: "pending",
        amount: "10",
        currency: "USDC",
        txHash: null,
        idempotencyKey: "idem-1",
      },
    }).as("createPayout");

    cy.intercept("POST", "**/api/remit/fiat/payout", {
      statusCode: 200,
      body: { payoutId: "fiat-payout-1", status: "pending" },
    }).as("fiatPayout");

    cy.intercept("POST", "**/api/circle/remit/send", {
      statusCode: 200,
      body: { transactionId: "tx-local-1", txHash: "0x" + "aa".repeat(32) },
    }).as("sameChainSend");

    cy.intercept("POST", `**/api/remittances/${remittanceId}/confirm`, {
      statusCode: 200,
      body: { status: "settled" },
    }).as("confirmRemit");
  });

  it("Path A → wallet fund → skip FX → Arc local crypto", () => {
    cy.visit("/remit");
    injectWallet();

    cy.contains("Pay in AED").should("not.exist");
    cy.get('[data-testid="funding-path-toggle"]').should("contain", "Path A");
    cy.get('[data-testid="wallet-fund-panel"]').should("exist");
    cy.wait("@walletBalance");
    cy.get('[data-testid="wallet-usdc"]').should("contain", "50");

    cy.get('[data-testid="fund-continue"]').click();
    cy.contains("Skip convert").click();

    cy.get('[data-testid="destination-chain"]').select("0");
    cy.get('[data-testid="send-amount"]').clear().type("10");
    cy.get('[data-testid="recipient-address"]').clear().type(
      "0x1111111111111111111111111111111111111111"
    );
    cy.wait("@compliance");

    cy.get('[data-testid="send-submit"]').click();
    cy.wait("@createRemittance");
    cy.wait("@sameChainSend");
    cy.get('[data-testid="settlement-tracker"]').should("exist");
    cy.get('[data-testid="settlement-tracker"]').should("contain", "Fund");
    cy.get('[data-testid="settlement-tracker"]').should("contain", "Arc transfer");
  });

  it("Path A → CCTP and Gateway routing options when cross-chain", () => {
    cy.visit("/remit");
    injectWallet();
    cy.get('[data-testid="fund-continue"]').click();
    cy.contains("Skip convert").click();

    cy.get('[data-testid="destination-chain"]').then(($sel) => {
      const opts = [...$sel.find("option")].map((o) => o.value).filter((v) => v !== "0");
      expect(opts.length).to.be.greaterThan(0);
      cy.wrap($sel).select(opts[0]!);
    });

    cy.get('[data-testid="routing-method"]').should("exist");
    cy.get('[data-testid="routing-method"]').select("0");
    cy.get('[data-testid="routing-method"]').should("have.value", "0");
    cy.contains("CCTP").should("exist");

    cy.get('[data-testid="routing-method"]').select("1");
    cy.get('[data-testid="routing-method"]').should("have.value", "1");
    cy.get('[data-testid="fee-panel"]').should("contain", "Gateway");
  });

  it("Path B → bank fund → Payouts crypto", () => {
    cy.visit("/remit");
    injectWallet();

    cy.get('[data-testid="funding-path-toggle"]')
      .contains("button", /^Path B · Bank$/)
      .click();
    cy.get('[data-testid="bank-fund-panel"]').should("exist");
    cy.get('[data-testid="bank-amount"]').clear().type("50");
    cy.get('[data-testid="bank-fund-submit"]').click();
    cy.wait("@bankFund");
    cy.get('[data-testid="bank-fund-result"]').should("contain", "minted");

    cy.get('[data-testid="fund-continue"]').click();
    cy.contains("Skip convert").click();

    cy.get('[data-testid="send-amount"]').clear().type("10");
    cy.get('[data-testid="recipient-address"]').clear().type(
      "0x1111111111111111111111111111111111111111"
    );
    cy.contains("Stablecoin Payouts").should("exist");
    cy.get('[data-testid="send-submit"]').click();
    cy.wait("@registerRecipient");
    cy.wait("@createRemittance");
    cy.wait("@createPayout");
    cy.get('[data-testid="settlement-tracker"]').should("contain", "Payouts");
  });

  it("Path B · Bank-mock → one-shot fund + Payouts + AED bank settle UX", () => {
    cy.visit("/remit");
    injectWallet();

    cy.get('[data-testid="funding-path-toggle"]').contains("Bank-mock").click();
    cy.wait("@bankMockQuote");
    cy.get('[data-testid="bank-mock-fund-panel"]').should("exist");
    cy.get('[data-testid="remit-stepper"]').should("not.contain", "Convert");
    cy.get('[data-testid="remit-stepper"]').should("not.contain", "Send");
    cy.get('[data-testid="mock-sender-bank-name"]').type("FAB Demo");
    cy.get('[data-testid="mock-sender-iban"]').type("AE070331234567890123456");
    cy.get('[data-testid="mock-recipient-bank-name"]').type("ENBD Demo");
    cy.get('[data-testid="mock-recipient-iban"]').type("AE070339876543210987654");
    cy.get('[data-testid="bank-mock-aed-amount"]').clear().type("100");
    cy.get('[data-testid="bank-mock-usdc-estimate"]').should("contain", "USDC");
    cy.get('[data-testid="bank-mock-recipient-address"]').type(
      "0x1111111111111111111111111111111111111111"
    );
    cy.get('[data-testid="bank-mock-fund-submit"]').click();
    cy.wait("@bankMockFund");
    cy.wait("@registerRecipient");
    cy.wait("@createRemittance");
    cy.wait("@createPayout");
    cy.get('[data-testid="bank-mock-aed-settled"]').should(
      "contain",
      "reached the recipient's bank account"
    );
    cy.get('[data-testid="bank-mock-recipient-bank"]').should("contain", "ENBD Demo");
    cy.get('[data-testid="bank-mock-recipient-bank"]').should(
      "contain",
      "AE070339876543210987654"
    );
    cy.get('[data-testid="settlement-tracker"]').should("contain", "Bank-mock");
  });

  it("Path A send shows static crypto onchain delivery", () => {
    cy.visit("/remit");
    injectWallet();
    cy.get('[data-testid="fund-continue"]').click();
    cy.contains("Skip convert").click();

    cy.get("select[data-testid='delivery-mode']").should("not.exist");
    cy.get('[data-testid="delivery-mode"]').should("contain", "Crypto onchain");
    cy.contains("Fiat bank withdraw").should("not.exist");
  });

  it("Path B → optional StableFX convert then continue", () => {
    cy.visit("/remit");
    injectWallet();
    cy.get('[data-testid="funding-path-toggle"]')
      .contains("button", /^Path B · Bank$/)
      .click();
    cy.get('[data-testid="fund-continue"]').click();
    cy.wait("@fxQuote");
    cy.get('[data-testid="fx-quote-card"]').should("contain", "USDC/EURC");
    cy.contains("Convert & continue").click();
    cy.wait("@fxExecute");
    cy.get('[data-testid="step-send"]').should("exist");
  });
});
