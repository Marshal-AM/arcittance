/**
 * Treasury EOA — send Arc USDC to fund Circle Payins (Path B bank-mock).
 * Requires TREASURY_PRIVATE_KEY (no facilitator/deployer fallback).
 */
import { ethers } from "ethers";
import { ARC_RPC_URL, USDC_ADDRESS, TOKEN_DECIMALS } from "../../config/arc.testnet";

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

function resolveTreasuryPrivateKey(): string {
  const raw = process.env.TREASURY_PRIVATE_KEY?.trim();
  if (!raw) {
    throw new Error("TREASURY_PRIVATE_KEY is required for bank-mock funding");
  }
  return raw.startsWith("0x") ? raw : `0x${raw}`;
}

export function getTreasuryAddress(): string {
  return new ethers.Wallet(resolveTreasuryPrivateKey()).address;
}

export async function getTreasuryUsdcBalance(): Promise<string> {
  const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);
  const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, provider);
  const bal: bigint = await usdc.balanceOf(getTreasuryAddress());
  return ethers.formatUnits(bal, TOKEN_DECIMALS);
}

/** Transfer USDC on Arc from treasury EOA → `to` (Payins deposit address). */
export async function sendUsdcFromTreasury(params: {
  to: string;
  amount: string;
}): Promise<{ txHash: string; from: string; to: string; amount: string }> {
  if (!ethers.isAddress(params.to)) {
    throw new Error(`Invalid treasury transfer destination: ${params.to}`);
  }
  const amountNum = Number(params.amount);
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    throw new Error("Treasury USDC amount must be positive");
  }

  const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);
  const wallet = new ethers.Wallet(resolveTreasuryPrivateKey(), provider);
  const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, wallet);
  const wei = ethers.parseUnits(Number(params.amount).toFixed(TOKEN_DECIMALS), TOKEN_DECIMALS);

  const bal: bigint = await usdc.balanceOf(wallet.address);
  if (bal < wei) {
    throw new Error(
      `Treasury USDC insufficient: have ${ethers.formatUnits(bal, TOKEN_DECIMALS)}, need ${params.amount}`
    );
  }

  const tx = await usdc.transfer(params.to, wei);
  const receipt = await tx.wait();
  const txHash = receipt?.hash ?? tx.hash;

  return {
    txHash,
    from: wallet.address,
    to: params.to,
    amount: Number(params.amount).toFixed(2),
  };
}
