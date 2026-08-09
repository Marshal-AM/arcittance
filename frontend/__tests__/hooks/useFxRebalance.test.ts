import { renderHook, act } from "@testing-library/react";
import { useFxRebalance } from "@/hooks/useFxRebalance";

describe("useFxRebalance", () => {
  it("posts to /api/fx/rebalance and surfaces success", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        fxQuoteId: "q1",
        stablefxTradeId: "t1",
        status: "completed",
        rate: "1.1",
        feeUsdc: "0.02",
        settlementTransactionHash: "0xabc",
      }),
    }) as jest.Mock;

    const { result } = renderHook(() => useFxRebalance());

    await act(async () => {
      await result.current.rebalance({
        fromCurrency: "USDC",
        toCurrency: "EURC",
        amount: "10",
      });
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/fx/rebalance",
      expect.objectContaining({ method: "POST" })
    );
    expect(result.current.txStatus.status).toBe("success");
    expect(result.current.lastResult?.stablefxTradeId).toBe("t1");
  });
});
