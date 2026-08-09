// frontend/__tests__/api/subscriptions.test.ts

import { GET } from "@/app/api/subscriptions/route";

jest.mock("viem", () => ({
  createPublicClient: jest.fn(() => ({
    readContract: jest.fn()
      .mockResolvedValueOnce(1n)
      .mockResolvedValueOnce(1n)
      .mockResolvedValueOnce({
        provider:     "0xProvider00000000000000000000000000000001",
        token:        "0x3600000000000000000000000000000000000000",
        chargeAmount: 10_000_000n,
        interval:     2592000n,
        maxCharges:   0n,
        chargeCount:  0n,
        expiry:       0n,
        active:       true,
      })
      .mockResolvedValueOnce({
        subscriber:    "0xSubscriber0000000000000000000000000000001",
        planId:        0n,
        approvedCap:   120_000_000n,
        totalCharged:  0n,
        nextChargeDue: 1700000000n,
        active:        true,
      }),
  })),
  http: jest.fn(() => "mock-transport"),
}));

describe("GET /api/subscriptions", () => {
  it("returns plans and subscriptions", async () => {
    const response = await GET();
    const data     = await response.json();

    expect(data.totalPlans).toBe(1);
    expect(data.totalSubs).toBe(1);
    expect(data.plans).toHaveLength(1);
    expect(data.subscriptions).toHaveLength(1);
  });

  it("chargeAmount is stringified bigint", async () => {
    const response = await GET();
    const data     = await response.json();
    expect(typeof data.plans[0].chargeAmount).toBe("string");
    expect(data.plans[0].chargeAmount).toBe("10000000");
  });

  it("returns 500 on RPC error", async () => {
    const { createPublicClient } = require("viem");
    (createPublicClient as jest.Mock).mockReturnValueOnce({
      readContract: jest.fn().mockRejectedValue(new Error("RPC error")),
    });

    const response = await GET();
    expect(response.status).toBe(500);
  });
});
