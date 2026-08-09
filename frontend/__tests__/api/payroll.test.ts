// frontend/__tests__/api/payroll.test.ts

import { GET } from "@/app/api/payroll/route";
import { createPublicClient } from "viem";

const VAULT = "0x2Abb801011820682E7Daf8CC9C07fe5055D5E5Ef";

function payrollRequest(vault = VAULT) {
  return new Request(`http://localhost/api/payroll?vault=${vault}`);
}

function mockPayrollClient() {
  (createPublicClient as jest.Mock).mockReturnValue({
    readContract: jest.fn()
      .mockResolvedValueOnce(2n)
      .mockResolvedValueOnce({
        wallet:             "0xEmployee100000000000000000000000000000001",
        salaryAmount:       100_000_000n,
        payToken:           "0x3600000000000000000000000000000000000000",
        payInterval:        2592000n,
        nextPaymentDue:     1700000000n,
        approvedCap:        100_000_000n,
        destinationChainId: 0,
        routingMethod:      0,
        transferSpeed:      0,
        active:             true,
      })
      .mockResolvedValueOnce({
        wallet:             "0xEmployee200000000000000000000000000000002",
        salaryAmount:       200_000_000n,
        payToken:           "0x3600000000000000000000000000000000000000",
        payInterval:        2592000n,
        nextPaymentDue:     1700000000n,
        approvedCap:        200_000_000n,
        destinationChainId: 6,
        routingMethod:      0,
        transferSpeed:      0,
        active:             true,
      }),
  });
}

jest.mock("viem", () => ({
  createPublicClient: jest.fn(),
  http: jest.fn(() => "mock-transport"),
  isAddress: jest.fn((v: string) => /^0x[a-fA-F0-9]{40}$/.test(v)),
}));

describe("GET /api/payroll", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPayrollClient();
  });

  it("returns employees array with correct structure", async () => {
    const response = await GET(payrollRequest());
    const data     = await response.json();

    expect(data.total).toBe(2);
    expect(data.employees).toHaveLength(2);
    expect(data.vault).toBe(VAULT);
  });

  it("converts bigint fields to strings for JSON serialisation", async () => {
    const response = await GET(payrollRequest());
    const data     = await response.json();
    const emp      = data.employees[0];

    expect(typeof emp.salaryAmount).toBe("string");
    expect(typeof emp.payInterval).toBe("string");
    expect(emp.salaryAmount).toBe("100000000");
  });

  it("includes destinationName for each employee", async () => {
    const response = await GET(payrollRequest());
    const data     = await response.json();

    expect(data.employees[0].destinationName).toBe("Arc (local)");
    expect(data.employees[1].destinationName).toBe("Base Sepolia");
  });

  it("returns 400 when vault param missing", async () => {
    const response = await GET(new Request("http://localhost/api/payroll"));
    expect(response.status).toBe(400);
  });

  it("returns 500 with error message on chain failure", async () => {
    (createPublicClient as jest.Mock).mockReturnValue({
      readContract: jest.fn().mockRejectedValue(new Error("RPC connection refused")),
    });

    const response = await GET(payrollRequest());
    const data     = await response.json();
    expect(response.status).toBe(500);
    expect(data.error).toContain("RPC connection refused");
  });
});
