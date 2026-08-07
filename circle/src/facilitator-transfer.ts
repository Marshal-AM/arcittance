/**
 * Transfer Arc USDC/EURC from the facilitator EOA (FACILITATOR_PRIVATE_KEY).
 * Used after Path A StableFX so converted funds land in the user's embedded wallet.
 */
import { ethers } from "ethers";
import {
  ARC_RPC_URL,
  EURC_ADDRESS,
  TOKEN_DECIMALS,
  USDC_ADDRESS,
} from "../../config/arc.testnet";
import { getEthersWallet } from "./wallet-adapters";

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
];

export async function getFacilitatorTokenBalance(
  currency: "USDC" | "EURC"
): Promise<{ address: string; balance: string }> {
  const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);
  const wallet = getEthersWallet("facilitator", provider);
  const token = currency === "EURC" ? EURC_ADDRESS : USDC_ADDRESS;
  const erc20 = new ethers.Contract(token, ERC20_ABI, provider);
  const raw: bigint = await erc20.balanceOf(wallet.address);
  return {
    address: wallet.address,
    balance: ethers.formatUnits(raw, TOKEN_DECIMALS),
  };
}

/**
 * Send `amount` of USDC/EURC from facilitator → `to`.
 * If balance is slightly under the quoted amount (StableFX fee / rounding),
 * send the full available balance instead of failing.
 */
export async function transferFromFacilitator(params: {
  currency: "USDC" | "EURC";
  to: string;
  amount: string;
}): Promise<{ txHash: string; from: string; amountSent: string }> {
  const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);
  const wallet = getEthersWallet("facilitator", provider);
  const token = params.currency === "EURC" ? EURC_ADDRESS : USDC_ADDRESS;
  const erc20 = new ethers.Contract(token, ERC20_ABI, wallet);
  const requested = ethers.parseUnits(params.amount, TOKEN_DECIMALS);
  const balance: bigint = await erc20.balanceOf(wallet.address);

  let sendAmount = requested;
  if (balance < requested) {
    // Quoted `to` amount is pre-fee; post-settle balance is slightly lower.
    const shortfall = requested - balance;
    const tolerance = requested / 50n; // 2%
    if (balance > 0n && shortfall <= tolerance) {
      sendAmount = balance;
    } else {
      throw new Error(
        `Facilitator ${wallet.address} has insufficient ${params.currency} to deliver: ` +
          `have ${ethers.formatUnits(balance, TOKEN_DECIMALS)}, need ${params.amount}`
      );
    }
  }

  const tx = await erc20.transfer(params.to, sendAmount);
  const receipt = await tx.wait(1);
  return {
    txHash: receipt?.hash ?? tx.hash,
    from: wallet.address,
    amountSent: ethers.formatUnits(sendAmount, TOKEN_DECIMALS),
  };
}
