import { getDestinationByDomain } from "../../config/cctp-domains";
import { ARC_LOCAL_DOMAIN } from "../../config/cctp-domains";
import { bridgeUsdc, type CctpTransferSpeed } from "./cctp-client";
import {
  depositToUnifiedBalance,
  spendFromUnifiedBalance,
} from "./gateway-client";
import {
  getFacilitatorEoaAddress,
  getFacilitatorWalletAddress,
} from "./wallet-adapters";
import {
  createUserTransferChallenge,
  waitForOutboundTransfer,
} from "./user-client";

const ROUTING_CCTP = 0;
const ROUTING_GATEWAY = 1;

/**
 * CCTP burns from the facilitator EOA (private-key Bridge Kit adapter).
 * Gateway deposit/spend uses the Circle SCA wallet — remit debit must land there.
 */
async function resolveFacilitatorDebitAddress(routingMethod: number): Promise<string> {
  if (Number(routingMethod) === ROUTING_GATEWAY) {
    return getFacilitatorWalletAddress();
  }
  return getFacilitatorEoaAddress();
}

export interface CrossChainRemittanceParams {
  userToken: string;
  walletId: string;
  recipient: string;
  /** USDC amount in human decimal (e.g. "10.50") */
  amountUsdc: string;
  destinationChainId: number;
  routingMethod: number;
  transferSpeed?: CctpTransferSpeed;
}

export interface CrossChainRemittancePrepareResult {
  challengeId: string;
  facilitatorAddress: string;
  amountMicro: string;
}

export interface CrossChainRemittanceResult {
  userTransferId: string;
  userTransferState: string;
  facilitatorAddress: string;
  /** On-chain Arc tx hash for the user → facilitator transfer */
  arcTxHash?: string;
  /** CCTP burn tx on Arc (if bridged) */
  burnTxHash?: string;
  /** Gateway spend / mint tx on destination (if Gateway routed) */
  spendTxHash?: string;
  /** Relay + protocol fees deducted at mint (USDC decimal string) */
  bridgeFeeUsdc?: string;
  orchestration: {
    method: "cctp" | "gateway";
    bridgeResult?: unknown;
    depositResult?: unknown;
    spendResult?: unknown;
  };
}

/**
 * Step 1: create Circle transfer challenge (user wallet → facilitator on Arc).
 * Frontend must execute challengeId via Web SDK before calling completeCrossChainRemittance.
 */
export async function prepareCrossChainRemittance(
  params: CrossChainRemittanceParams
): Promise<CrossChainRemittancePrepareResult> {
  if (params.destinationChainId === ARC_LOCAL_DOMAIN) {
    throw new Error("Use same-chain remit/send for Arc-local transfers");
  }

  const dest = getDestinationByDomain(params.destinationChainId);
  if (!dest) {
    throw new Error(`Unsupported destination domain: ${params.destinationChainId}`);
  }

  const facilitatorAddress = await resolveFacilitatorDebitAddress(params.routingMethod);
  const amountMicro = String(Math.round(Number(params.amountUsdc) * 1_000_000));

  const { challengeId } = await createUserTransferChallenge({
    userToken:          params.userToken,
    walletId:           params.walletId,
    destinationAddress: facilitatorAddress,
    amountUsdc:         params.amountUsdc,
  });

  return { challengeId, facilitatorAddress, amountMicro };
}

/**
 * Step 2: wait for user debit, then facilitator bridges via CCTP or Gateway.
 *
 * Gateway path (matches scripts/test-gateway-unified.ts):
 *   user → Circle SCA on Arc → depositToUnifiedBalance → spend to recipient
 */
export async function completeCrossChainRemittance(
  params: CrossChainRemittanceParams
): Promise<CrossChainRemittanceResult> {
  if (params.destinationChainId === ARC_LOCAL_DOMAIN) {
    throw new Error("Use same-chain remit/send for Arc-local transfers");
  }

  const dest = getDestinationByDomain(params.destinationChainId);
  if (!dest) {
    throw new Error(`Unsupported destination domain: ${params.destinationChainId}`);
  }

  const routingMethod = Number(params.routingMethod);
  const facilitatorAddress = await resolveFacilitatorDebitAddress(routingMethod);
  const amountMicro = String(Math.round(Number(params.amountUsdc) * 1_000_000));

  const userDebit = await waitForOutboundTransfer({
    walletId:           params.walletId,
    destinationAddress: facilitatorAddress,
    amountMicro,
  });

  if (routingMethod === ROUTING_GATEWAY) {
    // Must deposit Arc SCA USDC into Gateway before spend — otherwise spend
    // either fails or draws unrelated pre-funded unified balance.
    const depositResult = await depositToUnifiedBalance({
      sourceChain: "Arc_Testnet",
      amount:      params.amountUsdc,
    });

    const spendResult = await spendFromUnifiedBalance({
      amount:           params.amountUsdc,
      destinationChain: dest.bridgeKitName,
      recipientAddress: params.recipient,
    });

    const spendMeta = spendResult as { txHash?: string; transferId?: string };
    const spendTxHash = spendMeta.txHash;
    if (!spendTxHash && !spendMeta.transferId) {
      throw new Error(
        "Gateway spend completed without a destination txHash/transferId — recipient may not have been funded"
      );
    }

    return {
      userTransferId:    userDebit.transactionId,
      userTransferState: userDebit.state,
      facilitatorAddress,
      arcTxHash:         userDebit.txHash,
      spendTxHash,
      orchestration:     { method: "gateway", depositResult, spendResult },
    };
  }

  // Default / ROUTING_CCTP
  void ROUTING_CCTP;
  const bridgeResult = await bridgeUsdc({
    fromChain:        "Arc_Testnet",
    toChain:          dest.bridgeKitName,
    amount:           params.amountUsdc,
    recipientAddress: params.recipient,
    speed:            params.transferSpeed,
  });

  return {
    userTransferId:    userDebit.transactionId,
    userTransferState: userDebit.state,
    facilitatorAddress,
    arcTxHash:         userDebit.txHash,
    burnTxHash:        bridgeResult.burnTxHash,
    bridgeFeeUsdc:     bridgeResult.estimatedFeesUsdc,
    orchestration:     { method: "cctp", bridgeResult },
  };
}

/** Alias for Path A cross-chain deliverable naming in phase10rework. */
export const payRecipientCrossChain = completeCrossChainRemittance;

/** @deprecated Use prepareCrossChainRemittance + SDK execute + completeCrossChainRemittance */
export async function orchestrateCrossChainRemittance(
  params: CrossChainRemittanceParams
): Promise<CrossChainRemittanceResult> {
  const prepared = await prepareCrossChainRemittance(params);
  throw new Error(
    `Cross-chain remit requires Web SDK authorization (challengeId=${prepared.challengeId}). ` +
      "Use the /remit two-step flow."
  );
}
