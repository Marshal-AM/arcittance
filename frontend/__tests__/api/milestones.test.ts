// frontend/__tests__/api/milestones.test.ts

import { GET } from "@/app/api/milestones/route";

jest.mock("viem", () => ({
  createPublicClient: jest.fn(() => ({
    readContract: jest.fn()
      .mockResolvedValueOnce(1n)
      .mockResolvedValueOnce([
        "0xPayer000000000000000000000000000000000001",
        "0xPayee000000000000000000000000000000000001",
        "0x3600000000000000000000000000000000000000",
        500_000_000n,
        ["0xApprover00000000000000000000000000000001"],
        1n,
        0n,
        BigInt(Math.floor(Date.now() / 1000) + 3600),
        false,
        false,
      ]),
  })),
  http: jest.fn(() => "mock-transport"),
}));

describe("GET /api/milestones", () => {
  it("returns milestones array", async () => {
    const response = await GET();
    const data     = await response.json();

    expect(data.total).toBe(1);
    expect(data.milestones).toHaveLength(1);
  });

  it("milestone amount is stringified bigint", async () => {
    const response = await GET();
    const data     = await response.json();
    expect(typeof data.milestones[0].amount).toBe("string");
    expect(data.milestones[0].amount).toBe("500000000");
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
