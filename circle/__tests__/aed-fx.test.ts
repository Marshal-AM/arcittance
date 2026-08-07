/**
 * AED FX unit tests (mocked fetch).
 */
import {
  aedToUsdc,
  usdcToAed,
  getAedFxQuote,
  clearAedFxCache,
} from "../src/aed-fx";

describe("aed-fx", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    clearAedFxCache();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    clearAedFxCache();
  });

  it("aedToUsdc / usdcToAed round-trip at peg-like rate", () => {
    const rate = 0.2723; // ~1 AED in USD
    expect(aedToUsdc("100", rate)).toBe("27.23");
    expect(usdcToAed("27.23", rate)).toBe("100.00");
  });

  it("rejects non-positive AED", () => {
    expect(() => aedToUsdc(0, 0.27)).toThrow(/positive/);
  });

  it("getAedFxQuote parses open.er-api.com shape", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        result: "success",
        rates: { USD: 0.272294 },
      }),
    }) as unknown as typeof fetch;

    const q = await getAedFxQuote(true);
    expect(q.aedToUsd).toBeCloseTo(0.272294);
    expect(q.usdToAed).toBeCloseTo(1 / 0.272294);
    expect(aedToUsdc("367.25", q.aedToUsd)).toBe("100.00");
  });
});
