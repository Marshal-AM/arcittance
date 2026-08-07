/**
 * StableFX quote path — expired quote and over-balance guards (pure logic mirrors API).
 */
describe("StableFX remit guards", () => {
  function rejectExpired(expiresAt: string, now = Date.now()): boolean {
    return new Date(expiresAt).getTime() < now;
  }

  function rejectOverBalance(available: string, amount: string): boolean {
    return Number(available) < Number(amount);
  }

  it("rejects expired quotes", () => {
    expect(rejectExpired(new Date(Date.now() - 1000).toISOString())).toBe(true);
    expect(rejectExpired(new Date(Date.now() + 10_000).toISOString())).toBe(false);
  });

  it("rejects amounts above custody balance", () => {
    expect(rejectOverBalance("5", "10")).toBe(true);
    expect(rejectOverBalance("25", "10")).toBe(false);
  });
});
