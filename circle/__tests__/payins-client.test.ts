/**
 * Payins client — polling state machine unit tests (mocked HTTP).
 */
import { isPayinSettled, getPaymentIntent } from "../src/payins-client";
import { mintFetch } from "../src/mint-http";

jest.mock("../src/mint-http", () => ({
  mintFetch: jest.fn(),
  getMintApiKey: () => "TEST_KEY",
  getMintBaseUrl: () => "https://api-sandbox.circle.com",
}));

const mintFetchMock = mintFetch as jest.MockedFunction<typeof mintFetch>;

describe("isPayinSettled", () => {
  it("treats complete / paid timeline as settled", () => {
    expect(
      isPayinSettled({
        id: "1",
        status: "complete",
        raw: {},
      })
    ).toBe(true);
    expect(
      isPayinSettled({
        id: "1",
        status: "pending",
        amount: { amount: "10", currency: "USD" },
        amountPaid: { amount: "10", currency: "USD" },
        raw: {},
      })
    ).toBe(true);
  });

  it("returns false while waiting", () => {
    expect(
      isPayinSettled({
        id: "1",
        status: "pending",
        raw: {},
      })
    ).toBe(false);
  });
});

describe("getPaymentIntent poll", () => {
  beforeEach(() => {
    mintFetchMock.mockReset();
    process.env.CIRCLE_STABLEFX_API_KEY = "TEST_API_KEY:x";
  });

  it("normalizes deposit address from paymentMethods", async () => {
    mintFetchMock.mockResolvedValue({
      data: {
        id: "pi-1",
        amount: { amount: "10.00", currency: "USD" },
        timeline: [{ status: "pending" }],
        paymentMethods: [{ chain: "ARC", address: "0xabc" }],
      },
    } as any);

    const intent = await getPaymentIntent("pi-1");
    expect(intent.depositAddress).toBe("0xabc");
    expect(intent.chain).toBe("ARC");
    expect(intent.status).toBe("pending");
  });
});
