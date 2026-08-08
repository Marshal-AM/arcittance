/**
 * Integration: Gateway unified balance orchestration (off-chain).
 */

import { expect } from "chai";
import { pingGatewayApi } from "../../circle/src/gateway-client";

describe("Arc integration: Gateway unified balance", function () {
  this.timeout(120_000);

  before(function () {
    if (!process.env.DEPLOYER_PRIVATE_KEY) this.skip();
    if (process.env.SKIP_INTEGRATION === "1" || process.env.SKIP_GATEWAY_INTEGRATION === "1") {
      this.skip();
    }
  });

  it("Gateway API is reachable", async function () {
    await pingGatewayApi();
    expect(true).to.equal(true);
  });
});
