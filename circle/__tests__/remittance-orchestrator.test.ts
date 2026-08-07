/**
 * Remittance orchestrator — CCTP vs Gateway branch.
 */
import {
  completeCrossChainRemittance,
  prepareCrossChainRemittance,
  type CrossChainRemittanceParams,
} from "../src/remittance-orchestrator";
import { bridgeUsdc } from "../src/cctp-client";
import {
  depositToUnifiedBalance,
  spendFromUnifiedBalance,
} from "../src/gateway-client";
import { createUserTransferChallenge, waitForOutboundTransfer } from "../src/user-client";

jest.mock("../src/cctp-client", () => ({
  bridgeUsdc: jest.fn(),
}));
jest.mock("../src/gateway-client", () => ({
  depositToUnifiedBalance: jest.fn(),
  spendFromUnifiedBalance: jest.fn(),
}));
jest.mock("../src/user-client", () => ({
  createUserTransferChallenge: jest.fn().mockResolvedValue({ challengeId: "chal" }),
  waitForOutboundTransfer: jest.fn().mockResolvedValue({
    transactionId: "tx1",
    state: "COMPLETE",
    txHash: "0xabc",
  }),
}));
jest.mock("../src/wallet-adapters", () => ({
  getFacilitatorEoaAddress: () => "0xFacilitatorEoa",
  getFacilitatorWalletAddress: jest.fn().mockResolvedValue("0xFacilitatorSca"),
}));

const bridgeUsdcMock = bridgeUsdc as jest.MockedFunction<typeof bridgeUsdc>;
const depositMock = depositToUnifiedBalance as jest.MockedFunction<
  typeof depositToUnifiedBalance
>;
const spendMock = spendFromUnifiedBalance as jest.MockedFunction<
  typeof spendFromUnifiedBalance
>;
const createChallengeMock = createUserTransferChallenge as jest.MockedFunction<
  typeof createUserTransferChallenge
>;
const waitMock = waitForOutboundTransfer as jest.MockedFunction<
  typeof waitForOutboundTransfer
>;

describe("completeCrossChainRemittance routing", () => {
  const base: CrossChainRemittanceParams = {
    userToken: "tok",
    walletId: "w1",
    recipient: "0x1111111111111111111111111111111111111111",
    amountUsdc: "10",
    destinationChainId: 6,
    routingMethod: 0,
    transferSpeed: "fast",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    bridgeUsdcMock.mockResolvedValue({
      burnTxHash: "0xburn",
      estimatedFeesUsdc: "0.05",
    } as any);
    depositMock.mockResolvedValue({} as any);
    spendMock.mockResolvedValue({ txHash: "0xspend", transferId: "gw1" } as any);
  });

  it("uses CCTP when routingMethod is 0 (debit to EOA)", async () => {
    const result = await completeCrossChainRemittance({ ...base, routingMethod: 0 });
    expect(waitMock).toHaveBeenCalledWith(
      expect.objectContaining({ destinationAddress: "0xFacilitatorEoa" })
    );
    expect(bridgeUsdcMock).toHaveBeenCalled();
    expect(depositMock).not.toHaveBeenCalled();
    expect(spendMock).not.toHaveBeenCalled();
    expect(result.orchestration.method).toBe("cctp");
  });

  it("uses Gateway when routingMethod is 1 (SCA debit → deposit → spend)", async () => {
    const result = await completeCrossChainRemittance({ ...base, routingMethod: 1 });
    expect(waitMock).toHaveBeenCalledWith(
      expect.objectContaining({ destinationAddress: "0xFacilitatorSca" })
    );
    expect(depositMock).toHaveBeenCalledWith({
      sourceChain: "Arc_Testnet",
      amount: "10",
    });
    expect(spendMock).toHaveBeenCalledWith({
      amount: "10",
      destinationChain: "Base_Sepolia",
      recipientAddress: base.recipient,
    });
    expect(bridgeUsdcMock).not.toHaveBeenCalled();
    expect(result.orchestration.method).toBe("gateway");
    expect(result.spendTxHash).toBe("0xspend");
  });

  it("treats string routingMethod '1' as Gateway", async () => {
    await completeCrossChainRemittance({
      ...base,
      routingMethod: "1" as unknown as number,
    });
    expect(depositMock).toHaveBeenCalled();
    expect(spendMock).toHaveBeenCalled();
  });

  it("prepare routes Gateway debit to Circle SCA", async () => {
    await prepareCrossChainRemittance({ ...base, routingMethod: 1 });
    expect(createChallengeMock).toHaveBeenCalledWith(
      expect.objectContaining({ destinationAddress: "0xFacilitatorSca" })
    );
  });
});
