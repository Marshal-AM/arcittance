import { defineConfig } from "cypress";

interface SendTxArgs {
  pk:       `0x${string}`;
  rpc:      string;
  txParams: {
    address:      `0x${string}`;
    abi:          any[];
    functionName: string;
    args?:        any[];
    gas?:         string;
    value?:       string;
  };
}

const arcChain = {
  id:             5042002,
  name:           "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 6 },
  rpcUrls:        { default: { http: ["https://rpc.testnet.arc.io"] } },
} as const;

export default defineConfig({
  e2e: {
    baseUrl:          "http://localhost:3000",
    specPattern:      "cypress/e2e/**/*.cy.ts",
    supportFile:      "cypress/support/e2e.ts",
    viewportWidth:    1280,
    viewportHeight:   800,
    defaultCommandTimeout: 60_000,
    requestTimeout:   30_000,
    responseTimeout:  30_000,
    video:            true,
    screenshotOnRunFailure: true,
    env: {
      DEPLOYER_PRIVATE_KEY: "",
      ARC_RPC_URL:          "https://rpc.testnet.arc.io",
      VAULT_ADDRESS:        "0x2Abb801011820682E7Daf8CC9C07fe5055D5E5Ef",
      ESCROW_ADDRESS:       "0x510F6a58470618E80Cf85A1146D02545b52fc01D",
      SUB_ADDRESS:          "0x74D83bab601bC797212E4E886cE8e405abFc2D8C",
      USDC_ADDRESS:         "0x3600000000000000000000000000000000000000",
      CONNECTED_ADDRESS:    "",
    },

    setupNodeEvents(on, config) {
      on("task", {
        log(message: string) {
          console.log("[cypress:task]", message);
          return null;
        },

        async sendTransaction({ pk, rpc, txParams }: SendTxArgs) {
          const { createWalletClient, createPublicClient, http } = await import("viem");
          const { privateKeyToAccount }                          = await import("viem/accounts");

          const account = privateKeyToAccount(pk);
          const chain   = { ...arcChain, rpcUrls: { default: { http: [rpc] } } };

          const walletClient = createWalletClient({
            account,
            chain:     chain as any,
            transport: http(rpc),
          });
          const publicClient = createPublicClient({
            chain:     chain as any,
            transport: http(rpc),
          });

          const coerceArg = (v: unknown): unknown => {
            if (typeof v === "string" && /^\d+$/.test(v)) return BigInt(v);
            if (Array.isArray(v)) return v.map(coerceArg);
            return v;
          };
          const coercedArgs = (txParams.args ?? []).map(coerceArg);
          const coercedGas  = txParams.gas   ? BigInt(txParams.gas)   : undefined;
          const coercedVal  = txParams.value ? BigInt(txParams.value) : undefined;

          const hash = await walletClient.writeContract({
            account,
            chain:        chain as any,
            address:      txParams.address,
            abi:          txParams.abi,
            functionName: txParams.functionName,
            args:         coercedArgs,
            gas:          coercedGas,
            value:        coercedVal,
          } as any);

          await publicClient.waitForTransactionReceipt({ hash });
          console.log(`[cypress:task] sendTransaction confirmed: ${hash}`);
          return hash;
        },

        async readContract({ rpc, address, abi, functionName, args }: {
          rpc: string; address: `0x${string}`; abi: any[];
          functionName: string; args?: any[];
        }) {
          const { createPublicClient, http } = await import("viem");
          const client = createPublicClient({
            chain:     arcChain as any,
            transport: http(rpc),
          });
          const result = await client.readContract({ address, abi, functionName, args: args ?? [] } as any);
          return result == null ? null : String(result);
        },
      });

      return config;
    },
  },
});
