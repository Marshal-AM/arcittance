import { screenAddress } from "../src/compliance";

describe("compliance", () => {
  beforeEach(() => {
    process.env.CIRCLE_COMPLIANCE_BLOCKLIST = "0x000000000000000000000000000000000000dEaD";
  });

  it("allows non-blocklisted address", () => {
    const result = screenAddress("0x80568CF6687392bD74f15b1C600029499D97Ff40");
    expect(result.allowed).toBe(true);
  });

  it("blocks dead address", () => {
    const result = screenAddress("0x000000000000000000000000000000000000dEaD");
    expect(result.allowed).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it("rejects invalid address", () => {
    const result = screenAddress("not-an-address");
    expect(result.allowed).toBe(false);
  });
});
