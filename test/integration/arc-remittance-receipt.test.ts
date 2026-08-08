/**
 * Integration: remittance compliance + receipt prerequisites.
 */

import { expect } from "chai";
import { screenAddress } from "../../circle/src/compliance";

describe("Arc integration: remittance receipt", function () {
  before(function () {
    if (process.env.SKIP_INTEGRATION === "1") this.skip();
  });

  it("compliance screening allows known good address", function () {
    const result = screenAddress("0x80568CF6687392bD74f15b1C600029499D97Ff40");
    expect(result.allowed).to.equal(true);
  });
});
