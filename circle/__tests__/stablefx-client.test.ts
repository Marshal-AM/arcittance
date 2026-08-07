/**
 * StableFX client unit tests — fixtures mirror live sandbox quote shapes.
 * Network is mocked; live probe is scripts/test-stablefx-quote.ts.
 */

import {
  aedToUsdc,
  feeToSpreadBps,
  checkStableFxAccess,
  requestQuote,
  createTrade,
  AED_USD_PEG,
} from "../src/stablefx-client";

const SAMPLE_QUOTE = {
  data: {
    id: "8728232e-aa39-40e2-8162-74c7dac2d0e1",
    rate: "1.1167",
    from: { amount: "10", currency: "USDC" },
    to: { amount: "8.954956", currency: "EURC" },
    fee: "0.022388",
    collateral: "0",
    createdAt: "2026-08-08T04:57:23.048Z",
    expiresAt: "2026-08-08T04:57:26.548Z",
    typedData: {
      domain: {
        name: "Permit2",
        chainId: 5042002,
        verifyingContract: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
      },
      types: {},
      primaryType: "PermitWitnessTransferFrom",
      message: {},
    },
  },
};

describe("aedToUsdc / feeToSpreadBps", () => {
  it("converts AED via documented peg", () => {
    expect(Number(aedToUsdc(AED_USD_PEG))).toBeCloseTo(1, 5);
    expect(aedToUsdc("367.25")).toBe("100");
  });

  it("maps fee to bps", () => {
    expect(feeToSpreadBps("0.25", "100")).toBe(25);
    expect(feeToSpreadBps("0", "100")).toBe(0);
  });
});

describe("checkStableFxAccess", () => {
  const prev = process.env.CIRCLE_STABLEFX_API_KEY;

  afterEach(() => {
    if (prev === undefined) delete process.env.CIRCLE_STABLEFX_API_KEY;
    else process.env.CIRCLE_STABLEFX_API_KEY = prev;
  });

  it("returns pending when key missing", () => {
    delete process.env.CIRCLE_STABLEFX_API_KEY;
    expect(checkStableFxAccess().status).toBe("pending");
  });

  it("returns configured when key set", () => {
    process.env.CIRCLE_STABLEFX_API_KEY = "TEST_API_KEY:dummy";
    expect(checkStableFxAccess().status).toBe("configured");
  });
});

describe("requestQuote / createTrade", () => {
  const prevKey = process.env.CIRCLE_STABLEFX_API_KEY;
  const prevArc = process.env.ARC_NETWORK;
  const prevApi = process.env.CIRCLE_API_KEY;
  const prevEntity = process.env.CIRCLE_WALLETS_ENTITY_SECRET;
  const prevCctp = process.env.CIRCLE_CCTP_BRIDGEKIT_CONFIG;

  beforeEach(() => {
    process.env.ARC_NETWORK = "arc:testnet";
    process.env.CIRCLE_API_KEY = "TEST_API_KEY:wallets";
    process.env.CIRCLE_WALLETS_ENTITY_SECRET = "00".repeat(32);
    process.env.CIRCLE_CCTP_BRIDGEKIT_CONFIG = '{"arcDomain":26}';
    process.env.CIRCLE_STABLEFX_API_KEY = "TEST_API_KEY:stablefx";
    process.env.STABLEFX_API_BASE_URL = "https://api-sandbox.circle.com";
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (prevKey === undefined) delete process.env.CIRCLE_STABLEFX_API_KEY;
    else process.env.CIRCLE_STABLEFX_API_KEY = prevKey;
    if (prevArc === undefined) delete process.env.ARC_NETWORK;
    else process.env.ARC_NETWORK = prevArc;
    if (prevApi === undefined) delete process.env.CIRCLE_API_KEY;
    else process.env.CIRCLE_API_KEY = prevApi;
    if (prevEntity === undefined) delete process.env.CIRCLE_WALLETS_ENTITY_SECRET;
    else process.env.CIRCLE_WALLETS_ENTITY_SECRET = prevEntity;
    if (prevCctp === undefined) delete process.env.CIRCLE_CCTP_BRIDGEKIT_CONFIG;
    else process.env.CIRCLE_CCTP_BRIDGEKIT_CONFIG = prevCctp;
  });

  it("parses sandbox quote envelope", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 201,
      text: async () => JSON.stringify(SAMPLE_QUOTE),
    } as Response);

    const quote = await requestQuote({
      from: { currency: "USDC", amount: "10" },
      to: { currency: "EURC" },
      recipientAddress: "0x1f531ce3c418bbd830d06138a9e5b5eacfdfb3d6",
    });

    expect(quote.id).toBe(SAMPLE_QUOTE.data.id);
    expect(quote.rate).toBe("1.1167");
    expect(quote.fee).toBe("0.022388");
    expect(quote.to.currency).toBe("EURC");
  });

  it("creates trade with signed Permit2 message", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          data: {
            id: "trade-1",
            quoteId: SAMPLE_QUOTE.data.id,
            status: "pending_settlement",
            rate: "1.1167",
            from: { currency: "USDC", amount: "10" },
            to: { currency: "EURC", amount: "8.95" },
            contractTradeId: "24",
          },
        }),
    } as Response);

    const trade = await createTrade({
      quoteId: SAMPLE_QUOTE.data.id,
      address: "0x1f531ce3c418bbd830d06138a9e5b5eacfdfb3d6",
      message: { permitted: { token: "0x0", amount: 1 }, nonce: 1 },
      signature: "0xdead",
    });
    expect(trade.id).toBe("trade-1");
    expect(trade.status).toBe("pending_settlement");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.quoteId).toBe(SAMPLE_QUOTE.data.id);
    expect(body.address).toBeTruthy();
    expect(body.message).toBeTruthy();
    expect(body.signature).toBe("0xdead");
    expect(body.idempotencyKey).toBeTruthy();
  });

  it("fails hard on API errors", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      text: async () => JSON.stringify({ message: "Invalid credentials" }),
    } as Response);

    await expect(
      requestQuote({
        from: { currency: "USDC", amount: "10" },
        to: { currency: "EURC" },
        recipientAddress: "0x1f531ce3c418bbd830d06138a9e5b5eacfdfb3d6",
      })
    ).rejects.toThrow(/401/);
  });
});
