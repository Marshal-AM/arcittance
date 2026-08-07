import { routingMethodToOnChain, selectRoutingMethod } from "../src/routing";

describe("selectRoutingMethod", () => {
  it("returns arc-local for destinationChainId 0", () => {
    expect(selectRoutingMethod({ destinationChainId: 0 })).toBe("arc-local");
  });

  it("returns cctp for cross-chain point-to-point", () => {
    expect(
      selectRoutingMethod({ destinationChainId: 6, payoutType: "point-to-point" })
    ).toBe("cctp");
  });

  it("defaults to cctp for cross-chain without payoutType", () => {
    expect(selectRoutingMethod({ destinationChainId: 6 })).toBe("cctp");
  });

  it("returns cctp for marketplace-batch", () => {
    expect(
      selectRoutingMethod({ destinationChainId: 6, payoutType: "marketplace-batch" })
    ).toBe("cctp");
  });

  it("maps on-chain routing method values", () => {
    expect(routingMethodToOnChain("cctp")).toBe(0);
    expect(routingMethodToOnChain("arc-local")).toBeNull();
  });
});
