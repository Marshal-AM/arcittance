import { normalizeEmployee } from "@/lib/payroll/normalizeEmployee";

describe("normalizeEmployee", () => {
  it("coerces uint fields from bigint to number", () => {
    const emp = normalizeEmployee({
      wallet:             "0xabc0000000000000000000000000000000000001",
      salaryAmount:       1000000n,
      payToken:           "0x3600000000000000000000000000000000000000",
      payInterval:        2592000n,
      nextPaymentDue:     1700000000n,
      approvedCap:        12000000n,
      destinationChainId: 6n,
      routingMethod:      0n,
      transferSpeed:      1n,
      active:             true,
    }, 0n);

    expect(emp.destinationChainId).toBe(6);
    expect(emp.routingMethod).toBe(0);
    expect(emp.transferSpeed).toBe(1);
  });
});
