import { sponsorTransactionFee } from "../src/gas-station";

describe("gas-station", () => {
  it("returns medium fee level config", () => {
    const fee = sponsorTransactionFee();
    expect(fee.type).toBe("level");
    expect(fee.config.feeLevel).toBe("MEDIUM");
  });
});
