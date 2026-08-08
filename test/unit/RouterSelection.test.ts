import { expect } from "chai";
import { selectRoutingMethod, routingMethodToOnChain } from "../../circle/src/routing";

describe("RouterSelection", function () {
  it("selects Arc-local for destinationChainId 0", function () {
    expect(selectRoutingMethod({ destinationChainId: 0 })).to.equal("arc-local");
  });

  it("selects CCTP for cross-chain point-to-point payroll", function () {
    expect(
      selectRoutingMethod({ destinationChainId: 6, payoutType: "point-to-point" })
    ).to.equal("cctp");
  });

  it("selects CCTP for marketplace batch payout", function () {
    expect(
      selectRoutingMethod({ destinationChainId: 6, payoutType: "marketplace-batch" })
    ).to.equal("cctp");
  });

  it("maps routing method to on-chain uint8", function () {
    expect(routingMethodToOnChain("cctp")).to.equal(0);
    expect(routingMethodToOnChain("arc-local")).to.be.null;
  });
});
