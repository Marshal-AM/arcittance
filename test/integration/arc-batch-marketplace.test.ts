/**
 * Integration: marketplace batch / subscription batch prerequisites.
 */

import { expect } from "chai";
import { selectRoutingMethod } from "../../circle/src/routing";

describe("Arc integration: batch marketplace routing", function () {
  before(function () {
    if (process.env.SKIP_INTEGRATION === "1") this.skip();
  });

  it("selects CCTP for marketplace-batch payouts", function () {
    expect(
      selectRoutingMethod({ destinationChainId: 6, payoutType: "marketplace-batch" })
    ).to.equal("cctp");
  });
});
