import {
  addDelegate,
  createUnifiedBalanceKitContext,
  deposit,
  getBalances,
  getDelegateStatus,
  spend,
  type DepositResult,
  type GetBalancesResult,
  type SpendResult,
} from "@circle-fin/unified-balance-kit";
import { getCircleConfig } from "./config";
import {
  getEthersAdapterFromPrivateKey,
  getFacilitatorAdapterContext,
  getFacilitatorEoaAddress,
} from "./wallet-adapters";

const GATEWAY_API_BASE = "https://api.circle.com/v1/gateway";

function getGatewayContext() {
  return createUnifiedBalanceKitContext();
}

/** Ping Circle Gateway API — validates gateway API key. */
export async function pingGatewayApi(): Promise<void> {
  const { gatewayApiKey } = getCircleConfig();

  const res = await fetch(`${GATEWAY_API_BASE}/health`, {
    headers: {
      Authorization: `Bearer ${gatewayApiKey}`,
      "Content-Type": "application/json",
    },
  });

  if (res.status === 404) {
    const alt = await fetch(`${GATEWAY_API_BASE}/balances`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${gatewayApiKey}`,
        "Content-Type": "application/json",
      },
    });
    if (alt.status >= 500) {
      const body = await alt.text();
      throw new Error(`Circle Gateway API unreachable (${alt.status}): ${body}`);
    }
    return;
  }

  if (!res.ok && res.status !== 401) {
    const body = await res.text();
    throw new Error(`Circle Gateway API ping failed (${res.status}): ${body}`);
  }
}

/** Query aggregated unified USDC balance across Gateway-supported chains. */
export async function getUnifiedBalance(): Promise<GetBalancesResult> {
  const { adapter, address } = await getFacilitatorAdapterContext();
  const context = getGatewayContext();

  return getBalances(context, {
    sources: { adapter, address },
    includePending: true,
  });
}

/** Deposit USDC from a source chain into the caller's unified Gateway balance. */
export async function depositToUnifiedBalance(params: {
  sourceChain: string;
  amount: string;
  token?: "USDC";
}): Promise<DepositResult> {
  const { adapter, address } = await getFacilitatorAdapterContext();
  const context = getGatewayContext();

  return deposit(context, {
    from: { adapter, chain: params.sourceChain as never, address },
    amount: params.amount,
    token: params.token ?? "USDC",
  });
}

/** Register facilitator EOA as Gateway delegate for the Circle SCA (required for spend). */
async function ensureGatewayDelegate(
  chain: string,
  scaAdapter: Awaited<ReturnType<typeof getFacilitatorAdapterContext>>["adapter"],
  scaAddress: string
): Promise<void> {
  const eoaAddress = getFacilitatorEoaAddress();
  const context = getGatewayContext();

  const status = await getDelegateStatus(context, {
    from:      { adapter: scaAdapter, chain: chain as never, address: scaAddress },
    delegateAddress: eoaAddress,
    token:     "USDC",
  });

  if (status === "ready") return;

  await addDelegate(context, {
    from: { adapter: scaAdapter, chain: chain as never, address: scaAddress },
    delegateAddress: eoaAddress,
  });
}

/** Spend (mint) USDC on a destination chain from unified Gateway balance. */
export async function spendFromUnifiedBalance(params: {
  amount: string;
  destinationChain: string;
  recipientAddress: string;
  sourceChain?: string;
}): Promise<SpendResult> {
  const { adapter: scaAdapter, address: scaAddress } = await getFacilitatorAdapterContext();
  const eoaAdapter = getEthersAdapterFromPrivateKey("facilitator");
  const context = getGatewayContext();
  const sourceChain = params.sourceChain ?? "Arc_Testnet";

  // Gateway burn-intent must be signed by an EOA; Circle SCA funds use delegate pattern.
  await ensureGatewayDelegate(sourceChain, scaAdapter, scaAddress);

  const from = {
    adapter:       eoaAdapter,
    sourceAccount: scaAddress,
    allocations: {
      amount: params.amount,
      chain:  sourceChain as never,
    },
  };

  const destChain = params.destinationChain;
  const isArcDestination =
    destChain === "Arc_Testnet" || destChain === "Arc Testnet";

  // Facilitator Circle wallet exists on Arc only — cross-chain mint uses Gateway forwarder.
  const to = isArcDestination
    ? {
        adapter:          scaAdapter,
        address:          scaAddress,
        chain:            destChain as never,
        recipientAddress: params.recipientAddress,
      }
    : {
        chain:            destChain as never,
        recipientAddress: params.recipientAddress,
        useForwarder:     true as const,
      };

  return spend(context, {
    amount: params.amount,
    token:  "USDC",
    from,
    to,
  });
}
