// frontend/__mocks__/wagmi.ts
/**
 * Manual mock for wagmi — overrides the real wagmi import in all tests.
 * Each test configures return values using jest.mocked() or mockReturnValue.
 */
export const useAccount = jest.fn(() => ({
  address:     "0xDeployer000000000000000000000000000000001" as `0x${string}`,
  isConnected: true,
  chainId:     5042002,
}));

export const useReadContract = jest.fn(() => ({
  data:      undefined,
  isLoading: false,
  isError:   false,
  error:     null,
  refetch:   jest.fn(),
}));

export const useWriteContract = jest.fn(() => ({
  writeContractAsync: jest.fn().mockResolvedValue(
    "0xTxHash000000000000000000000000000000000000000000000000000000000001"
  ),
  isPending: false,
  isError:   false,
  error:     null,
}));

export const useWaitForTransactionReceipt = jest.fn(() => ({
  isLoading: false,
  isSuccess: true,
  data:      { status: "success", blockNumber: 1n },
}));

export const usePublicClient = jest.fn(() => ({
  waitForTransactionReceipt: jest.fn().mockResolvedValue({ status: "success", logs: [] }),
  readContract: jest.fn().mockResolvedValue(1n),
}));
export const useSwitchChain = jest.fn(() => ({
  switchChain: jest.fn(),
  switchChainAsync: jest.fn().mockResolvedValue(undefined),
}));
export const http            = jest.fn(() => "http-transport-mock");
export const injected        = jest.fn(() => ({ id: "injected" }));
export const metaMask        = jest.fn(() => ({ id: "metaMask" }));
export const WagmiProvider   = ({ children }: any) => children;
export const useChainId      = jest.fn(() => 5042002);
