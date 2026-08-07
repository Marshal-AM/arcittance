import { ethers } from "ethers";
import { ARC_RPC_URL } from "../../config/arc.testnet";
import { getDestinationByDomain } from "../../config/cctp-domains";
import { completeCctpPayrollPayout, estimateCctpFee, payEmployeeCrossChain } from "./cctp-client";

const ROUTER_ABI = [
  "event RouteCCTP(address indexed token, uint256 amount, uint32 indexed destinationDomain, address indexed recipient, uint64 nonce)",
];

const VAULT_ABI = ["function crossChainRouter() view returns (address)"];

export interface CctpCompletion {
  burnTxHash?: string;
  destinationDomain: number;
  recipient: string;
  amount: string;
  confirmed: boolean;
  destinationBalance: string;
  elapsedMs: number;
}

export interface OrchestrationResult {
  payrollTxHash: string;
  cctpCompletions: CctpCompletion[];
}

export interface OrchestratePayrollParams {
  vaultAddress: string;
  payrollTxHash: string;
  routerAddress?: string;
}

/**
 * Complete off-chain CCTP mint legs after on-chain runPayroll().
 * Parses CrossChainRouter RouteCCTP events from the payroll receipt.
 */
export async function orchestratePayrollCrossChain(
  params: OrchestratePayrollParams
): Promise<OrchestrationResult> {
  const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);
  const receipt = await provider.getTransactionReceipt(params.payrollTxHash);
  if (!receipt) {
    throw new Error(`Payroll transaction not found: ${params.payrollTxHash}`);
  }

  const routerAddress =
    params.routerAddress ??
    (await new ethers.Contract(params.vaultAddress, VAULT_ABI, provider).crossChainRouter());

  const routerInterface = new ethers.Interface(ROUTER_ABI);
  const cctpCompletions: CctpCompletion[] = [];

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== routerAddress.toLowerCase()) continue;

    let parsed;
    try {
      parsed = routerInterface.parseLog(log);
    } catch {
      continue;
    }

    if (parsed?.name !== "RouteCCTP") continue;

    const amount = parsed.args.amount as bigint;
    const destinationDomain = Number(parsed.args.destinationDomain);
    const recipient = parsed.args.recipient as string;
    const dest = getDestinationByDomain(destinationDomain);
    const toChain = dest?.bridgeKitName ?? "Base_Sepolia";
    const amountDecimal = ethers.formatUnits(amount, 6);

    const bridgeResult = await payEmployeeCrossChain({
      employeeAddress:  recipient,
      amountUsdc:       amountDecimal,
      destinationChain: toChain,
      speed:            "standard",
      onProgress:       (step, detail) =>
        console.log(`  [cctp ${recipient.slice(0, 8)}…] ${step}: ${detail ?? ""}`),
    });

    let completion: Awaited<ReturnType<typeof completeCctpPayrollPayout>>;
    if (bridgeResult.state === "success") {
      completion = {
        confirmed:          true,
        destinationBalance: 0n,
        elapsedMs:          0,
      };
    } else {
      const feeEstimate = await estimateCctpFee({
        fromChain:        "Arc_Testnet",
        toChain,
        amount:           amountDecimal,
        recipientAddress: recipient,
        speed:            "standard",
      });
      const feeWei = ethers.parseUnits(feeEstimate.fee || "0", 6);
      const minExpected = amount > feeWei ? amount - feeWei : 1n;

      completion = await completeCctpPayrollPayout({
        destinationDomain,
        recipient,
        expectedAmountWei: amount,
        minExpectedWei:    minExpected,
        burnTxHash:        bridgeResult.burnTxHash,
        timeoutMs:         60_000,
      });
    }

    const confirmed = bridgeResult.state === "success" || completion.confirmed;

    cctpCompletions.push({
      burnTxHash: params.payrollTxHash,
      destinationDomain,
      recipient,
      amount: amount.toString(),
      confirmed,
      destinationBalance: completion.destinationBalance.toString(),
      elapsedMs: completion.elapsedMs,
    });

    if (!confirmed) {
      console.warn(
        `CCTP bridge submitted (state=${bridgeResult.state}) but destination mint not confirmed within timeout`
      );
    }
  }

  return {
    payrollTxHash: params.payrollTxHash,
    cctpCompletions,
  };
}
