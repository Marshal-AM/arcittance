/**
 * On-chain PvP registry helpers for FXSettlementEscrow.
 */

import { ethers } from "ethers";
import { ARC_RPC_URL } from "../../config/arc.testnet";
import { getEthersWallet } from "./wallet-adapters";

const ESCROW_ABI = [
  "function open(bytes32 remittanceRef, bytes32 stableFxTradeId, address payer, uint256 usdcAmount)",
  "function confirmFx(bytes32 remittanceRef, bytes32 settlementTxHash)",
  "function confirmPayout(bytes32 remittanceRef, bytes32 payoutTxHash)",
  "function isSettled(bytes32 remittanceRef) view returns (bool)",
];

export function getFxSettlementAddress(): string {
  const addr =
    process.env.FX_SETTLEMENT_ESCROW_ADDRESS ??
    process.env.NEXT_PUBLIC_FX_SETTLEMENT_ESCROW_ADDRESS;
  if (!addr) {
    throw new Error(
      "FX_SETTLEMENT_ESCROW_ADDRESS / NEXT_PUBLIC_FX_SETTLEMENT_ESCROW_ADDRESS required"
    );
  }
  return addr;
}

export function remittanceRefFromId(remittanceId: string): string {
  return ethers.id(remittanceId);
}

export function tradeIdToBytes32(tradeId: string): string {
  // StableFX trade ids are UUIDs — hash to bytes32 for on-chain storage.
  return ethers.id(tradeId);
}

export function txHashToBytes32(txHash: string): string {
  if (/^0x[a-fA-F0-9]{64}$/.test(txHash)) return txHash;
  return ethers.id(txHash || "pending");
}

function getEscrowContract() {
  const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);
  const wallet = getEthersWallet("facilitator", provider);
  return new ethers.Contract(getFxSettlementAddress(), ESCROW_ABI, wallet);
}

export async function openFxSettlement(params: {
  remittanceId: string;
  stableFxTradeId: string;
  payer: string;
  usdcAmountBaseUnits: bigint;
}): Promise<string> {
  const escrow = getEscrowContract();
  const tx = await escrow.open(
    remittanceRefFromId(params.remittanceId),
    tradeIdToBytes32(params.stableFxTradeId),
    params.payer,
    params.usdcAmountBaseUnits
  );
  const receipt = await tx.wait();
  return receipt?.hash ?? tx.hash;
}

export async function confirmFxOnChain(params: {
  remittanceId: string;
  settlementTxHash: string;
}): Promise<string> {
  const escrow = getEscrowContract();
  const tx = await escrow.confirmFx(
    remittanceRefFromId(params.remittanceId),
    txHashToBytes32(params.settlementTxHash)
  );
  const receipt = await tx.wait();
  return receipt?.hash ?? tx.hash;
}

export async function confirmPayoutOnChain(params: {
  remittanceId: string;
  payoutTxHash: string;
}): Promise<string> {
  const escrow = getEscrowContract();
  const tx = await escrow.confirmPayout(
    remittanceRefFromId(params.remittanceId),
    txHashToBytes32(params.payoutTxHash)
  );
  const receipt = await tx.wait();
  return receipt?.hash ?? tx.hash;
}
