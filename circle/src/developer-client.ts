import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { getCircleConfig } from "./config";
import { sponsorTransactionFee } from "./gas-station";

export function getDeveloperClient() {
  const { apiKey, walletsEntitySecret } = getCircleConfig();
  return initiateDeveloperControlledWalletsClient({
    apiKey,
    entitySecret: walletsEntitySecret,
  });
}

export interface ContractExecutionResult {
  transactionId: string;
  state: string;
  txHash?: string;
}

export async function executeContractCall(params: {
  walletId: string;
  contractAddress: string;
  abiFunctionSignature: string;
  abiParameters?: (string | number | boolean | string[])[];
}): Promise<ContractExecutionResult> {
  const client = getDeveloperClient();

  const response = await client.createContractExecutionTransaction({
    walletId:             params.walletId,
    contractAddress:      params.contractAddress,
    abiFunctionSignature: params.abiFunctionSignature,
    abiParameters:        params.abiParameters ?? [],
    fee:                  sponsorTransactionFee(),
  });

  const txId = response.data?.id;
  if (!txId) {
    throw new Error("Circle contract execution: missing transaction id");
  }

  const terminal = new Set(["COMPLETE", "CONFIRMED", "FAILED", "CANCELLED", "DENIED", "STUCK"]);
  const failed   = new Set(["FAILED", "CANCELLED", "DENIED", "STUCK"]);
  let tx: { state?: string; txHash?: string } | undefined;
  for (let i = 0; i < 60; i++) {
    const polled = await client.getTransaction({ id: txId });
    tx = polled.data?.transaction as { state?: string; txHash?: string } | undefined;
    if (tx?.state && terminal.has(tx.state)) break;
    await new Promise((r) => setTimeout(r, 2000));
  }

  const state = tx?.state ?? "UNKNOWN";
  if (failed.has(state)) {
    throw new Error(
      `Circle contract execution ${state} (${params.abiFunctionSignature}). ` +
      `Transaction id: ${txId}`
    );
  }

  return {
    transactionId: txId,
    state,
    txHash:        tx?.txHash,
  };
}

export async function runPayrollViaCircle(
  walletId: string,
  vaultAddress: string
): Promise<ContractExecutionResult> {
  return executeContractCall({
    walletId,
    contractAddress:      vaultAddress,
    abiFunctionSignature: "runPayroll()",
  });
}

export async function chargeSubscriptionViaCircle(
  walletId: string,
  subscriptionManagerAddress: string,
  subscriptionId: bigint
): Promise<ContractExecutionResult> {
  return executeContractCall({
    walletId,
    contractAddress:      subscriptionManagerAddress,
    abiFunctionSignature: "charge(uint256)",
    abiParameters:        [subscriptionId.toString()],
  });
}

export async function approveMilestoneViaCircle(
  walletId: string,
  escrowAddress: string,
  milestoneId: bigint
): Promise<ContractExecutionResult> {
  return executeContractCall({
    walletId,
    contractAddress:      escrowAddress,
    abiFunctionSignature: "approveMilestone(uint256)",
    abiParameters:        [milestoneId.toString()],
  });
}

export async function registerEmployeeViaCircle(
  walletId: string,
  vaultAddress: string,
  params: {
    wallet: string;
    salary: string;
    token: string;
    interval: string;
    cap: string;
    destinationChainId: number;
    routingMethod: number;
    transferSpeed: number;
  }
): Promise<ContractExecutionResult> {
  return executeContractCall({
    walletId,
    contractAddress: vaultAddress,
    abiFunctionSignature:
      "registerEmployee(address,uint256,address,uint256,uint256,uint32,uint8,uint8)",
    abiParameters: [
      params.wallet,
      params.salary,
      params.token,
      params.interval,
      params.cap,
      params.destinationChainId,
      params.routingMethod,
      params.transferSpeed,
    ],
  });
}

export async function createMilestoneViaCircle(
  walletId: string,
  escrowAddress: string,
  params: {
    payee: string;
    token: string;
    amount: string;
    approvers: string[];
    approvalsRequired: string;
    disputeDeadline: string;
  }
): Promise<{ approve: ContractExecutionResult; create: ContractExecutionResult }> {
  const approve = await executeContractCall({
    walletId,
    contractAddress:      params.token,
    abiFunctionSignature: "approve(address,uint256)",
    abiParameters:        [escrowAddress, params.amount],
  });

  const create = await executeContractCall({
    walletId,
    contractAddress:      escrowAddress,
    abiFunctionSignature:
      "createMilestone(address,address,uint256,address[],uint256,uint256)",
    abiParameters: [
      params.payee,
      params.token,
      params.amount,
      params.approvers,
      params.approvalsRequired,
      params.disputeDeadline,
    ],
  });

  return { approve, create };
}

export async function getWalletUsdcBalance(walletId: string): Promise<number> {
  const client = getDeveloperClient();
  const resp   = await client.getWalletTokenBalance({ id: walletId });
  const tokens = resp.data?.tokenBalances ?? [];

  for (const entry of tokens) {
    const ti = (entry as any).token ?? entry;
    const symbol = String(ti?.symbol ?? "").toUpperCase();
    if (symbol.includes("USDC")) {
      return parseFloat((entry as any).amount ?? (entry as any).balance ?? "0");
    }
  }
  return 0;
}
