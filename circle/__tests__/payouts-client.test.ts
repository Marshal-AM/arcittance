/**
 * Payouts — async failure → retry must use a new idempotencyKey.
 */
import { createPayout, getPayoutStatus } from "../src/payouts-client";
import { mintFetch } from "../src/mint-http";

jest.mock("../src/mint-http", () => ({
  mintFetch: jest.fn(),
}));

const mintFetchMock = mintFetch as jest.MockedFunction<typeof mintFetch>;

describe("payouts-client retry idempotency", () => {
  beforeEach(() => {
    mintFetchMock.mockReset();
    process.env.CIRCLE_STABLEFX_API_KEY = "TEST_API_KEY:x";
  });

  it("passes distinct idempotency keys on retry", async () => {
    mintFetchMock.mockResolvedValue({
      data: { id: "po-1", status: "pending" },
    } as any);

    await createPayout({
      recipientId: "r1",
      amount: "8.95",
      currency: "EURC",
      idempotencyKey: "key-a",
    });
    await createPayout({
      recipientId: "r1",
      amount: "8.95",
      currency: "EURC",
      idempotencyKey: "key-b",
    });

    const bodies = mintFetchMock.mock.calls.map((c) => JSON.parse(String(c[1]?.body)));
    expect(bodies[0].idempotencyKey).toBe("key-a");
    expect(bodies[1].idempotencyKey).toBe("key-b");
    expect(bodies[0].idempotencyKey).not.toBe(bodies[1].idempotencyKey);
  });

  it("surfaces async failed status", async () => {
    mintFetchMock.mockResolvedValue({
      data: { id: "po-2", status: "failed", errorCode: "risk_denied" },
    } as any);
    const p = await getPayoutStatus("po-2");
    expect(p.status).toBe("failed");
    expect(p.errorCode).toBe("risk_denied");
  });
});
