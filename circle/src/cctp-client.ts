import { BridgeKit, TransferSpeed } from "@circle-fin/bridge-kit";
import type { BridgeResult, EstimateResult } from "@circle-fin/bridge-kit";
import { ethers } from "ethers";
import { ARC_CCTP_DOMAIN } from "../../config/arc.testnet";
import { CCTP_DESTINATIONS, getDestinationByDomain } from "../../config/cctp-domains";
import { getCircleConfig } from "./config";
import { getChainRpcUrl, getEthersAdapterFromPrivateKey } from "./wallet-adapters";

/** Bridge Kit chain names supported as Arc → destination CCTP routes. */
type BridgeKitDestChain =
  | "Base_Sepolia"
  | "Arbitrum_Sepolia"
  | "Avalanche_Fuji";

export interface CctpConfig {
  arcDomain: number;
  [key: string]: unknown;
}

export type CctpTransferSpeed = "fast" | "standard";

export interface BridgeUsdcParams {
  fromChain: string;
  toChain: string;
  amount: string;
  recipientAddress: string;
  speed?: CctpTransferSpeed;
  /** Optional progress callback for CLI / tests */
  onProgress?: (step: string, detail?: string) => void;
  /** Attestation / relayer timeout hint (Bridge Kit handles polling internally) */
  attestationTimeoutMs?: number;
}

export interface BridgeUsdcStep {
  name: string;
  state: string;
  explorerUrl?: string;
  txHash?: string;
}

export interface BridgeUsdcResult {
  state: string;
  steps: BridgeUsdcStep[];
  /** Bridge Kit burn tx hash when available */
  burnTxHash?: string;
  /** Relay + protocol fees in USDC (decimal string) when estimated */
  estimatedFeesUsdc?: string;
}

export interface PayrollBridgePayout {
  employeeAddress: string;
  amountUsdc: string;
  destinationChain: string;
  speed?: CctpTransferSpeed;
  onProgress?: (step: string, detail?: string) => void;
}

export interface CompleteCctpPayoutParams {
  destinationDomain: number;
  recipient: string;
  expectedAmountWei: bigint;
  burnTxHash?: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
  /** Minimum acceptable mint (defaults to 99% of expected — covers relay fee deduction) */
  minExpectedWei?: bigint;
}

export interface CompleteCctpPayoutResult {
  confirmed: boolean;
  destinationBalance: bigint;
  elapsedMs: number;
}

const DOMAIN_USDC: Record<number, string> = Object.fromEntries(
  CCTP_DESTINATIONS.map((d) => [d.domain, d.usdcAddress])
);

const USDC_ABI = ["function balanceOf(address account) view returns (uint256)"];

let cachedKit: BridgeKit | null = null;

function getBridgeKit(): BridgeKit {
  if (!cachedKit) {
    cachedKit = new BridgeKit();
  }
  return cachedKit;
}

/** Validate CCTP config includes Arc domain 26. */
export function validateCctpBridgeKitConfig(): CctpConfig {
  const { cctpBridgeKitConfig } = getCircleConfig();

  let parsed: CctpConfig;
  try {
    parsed = JSON.parse(cctpBridgeKitConfig) as CctpConfig;
  } catch {
    throw new Error("CIRCLE_CCTP_BRIDGEKIT_CONFIG must be valid JSON");
  }

  const domain = parsed.arcDomain ?? parsed.arcCctpDomain ?? parsed.domain;
  if (domain !== ARC_CCTP_DOMAIN) {
    throw new Error(
      `CCTP config arcDomain must be ${ARC_CCTP_DOMAIN} (Arc testnet), got ${domain}`
    );
  }

  return parsed;
}

function resolveDestination(toChain: string) {
  const dest = CCTP_DESTINATIONS.find(
    (d) =>
      d.bridgeKitName === toChain ||
      d.label === toChain ||
      d.label.replace(/\s/g, "_") === toChain
  );
  if (!dest) {
    throw new Error(`Unsupported CCTP destination chain: ${toChain}`);
  }
  return dest;
}

function progress(params: { onProgress?: BridgeUsdcParams["onProgress"] }, step: string, detail?: string): void {
  params.onProgress?.(step, detail);
}

function toTransferSpeed(speed?: CctpTransferSpeed): TransferSpeed {
  return speed === "fast" ? TransferSpeed.FAST : TransferSpeed.SLOW;
}

function sumFeeUsdc(estimate: EstimateResult): string {
  let total = 0;
  for (const fee of estimate.fees) {
    const n = fee.amount ? Number(fee.amount) : 0;
    if (!Number.isNaN(n)) total += n;
  }
  return total > 0 ? total.toFixed(6).replace(/\.?0+$/, "") || "0" : "0";
}

/** CCTP requires amount > maxFee (burn + Orbit relay). Throws a clear error if not. */
export function assertAmountCoversCctpFees(amountUsdc: string, feeUsdc: string, destLabel: string): void {
  const amount = Number(amountUsdc);
  const fee = Number(feeUsdc);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("CCTP transfer amount must be greater than 0");
  }
  if (!Number.isFinite(fee) || fee <= 0) return;

  if (amount <= fee) {
    const minAmount = (fee + 0.01).toFixed(2);
    throw new Error(
      `CCTP fees to ${destLabel} (~${fee.toFixed(4)} USDC) exceed the transfer amount (${amountUsdc} USDC). ` +
        `Increase the payroll to more than ${minAmount} USDC (Orbit relay fee is deducted from the send amount).`
    );
  }
}

function mapBridgeSteps(result: BridgeResult): BridgeUsdcStep[] {
  return result.steps.map((step) => ({
    name:        step.name,
    state:       step.state,
    txHash:      step.txHash,
    explorerUrl: step.explorerUrl,
  }));
}

function extractBurnTxHash(result: BridgeResult): string | undefined {
  const burnStep = result.steps.find(
    (s) => s.name.toLowerCase().includes("burn") && s.state === "success"
  );
  return burnStep?.txHash;
}

function buildBridgeParams(params: BridgeUsdcParams) {
  const dest = resolveDestination(params.toChain);
  const adapter = getEthersAdapterFromPrivateKey("facilitator");
  const toChain = dest.bridgeKitName as BridgeKitDestChain;

  return {
    dest,
    bridgeParams: {
      from: {
        adapter,
        chain: "Arc_Testnet" as const,
      },
      to: {
        recipientAddress: params.recipientAddress,
        chain:            toChain,
        useForwarder:       true as const,
      },
      amount: params.amount,
      config: {
        transferSpeed: toTransferSpeed(params.speed),
      },
    },
  };
}

/**
 * Bridge USDC from facilitator Arc EOA to an employee on a destination chain.
 * Uses Bridge Kit forwarder-only destination mode — Circle's Orbit relayer
 * submits receiveMessage on the destination; no destination-chain ETH required.
 */
export async function payEmployeeCrossChain(
  payout: PayrollBridgePayout
): Promise<BridgeUsdcResult> {
  return bridgeUsdc({
    fromChain:        "Arc_Testnet",
    toChain:          payout.destinationChain,
    amount:           payout.amountUsdc,
    recipientAddress: payout.employeeAddress,
    speed:            payout.speed,
    onProgress:       payout.onProgress,
  });
}

/**
 * Bridge USDC Arc → destination via CCTP v2 + Circle Orbit forwarder.
 * mintRecipient is the final payee; relay fee is deducted in USDC at mint time.
 */
export async function bridgeUsdc(params: BridgeUsdcParams): Promise<BridgeUsdcResult> {
  validateCctpBridgeKitConfig();

  if (!params.fromChain.includes("Arc")) {
    throw new Error(`CCTP outbound flow only supports Arc source (got ${params.fromChain})`);
  }
  if (!params.recipientAddress) {
    throw new Error("recipientAddress is required (CCTP mintRecipient)");
  }

  const kit = getBridgeKit();
  const { dest, bridgeParams } = buildBridgeParams(params);

  progress(params, "estimate", `Arc → ${dest.label} (forwarder mode)…`);
  const estimate = await kit.estimate(bridgeParams);
  const estimatedFeesUsdc = sumFeeUsdc(estimate);
  progress(params, "estimate", `relay + protocol fees ≈ ${estimatedFeesUsdc} USDC`);

  assertAmountCoversCctpFees(params.amount, estimatedFeesUsdc, dest.label);

  progress(params, "bridge", `burning ${params.amount} USDC on Arc…`);
  const result = await kit.bridge(bridgeParams);

  for (const step of result.steps) {
    const detail = [
      step.state,
      step.txHash,
      step.forwarded ? "forwarded" : undefined,
      step.errorMessage,
    ]
      .filter(Boolean)
      .join(" | ");
    progress(params, step.name, detail);
  }

  const burnTxHash = extractBurnTxHash(result);
  if (burnTxHash) {
    progress(params, "burnTx", burnTxHash);
  }

  if (result.state === "error") {
    const failed = result.steps.find((s) => s.state === "error");
    throw new Error(
      failed?.errorMessage ??
        `Bridge Kit CCTP bridge failed on ${dest.label}`
    );
  }

  return {
    state:              result.state,
    steps:              mapBridgeSteps(result),
    burnTxHash,
    estimatedFeesUsdc,
  };
}

/** Estimate CCTP + Orbit relay fees for a forwarder-mode bridge. */
export async function estimateCctpFee(
  params: BridgeUsdcParams
): Promise<{ fee: string; estimatedTimeSeconds: number }> {
  validateCctpBridgeKitConfig();
  const kit = getBridgeKit();
  const { bridgeParams } = buildBridgeParams(params);
  const estimate = await kit.estimate(bridgeParams);

  return {
    fee:                  sumFeeUsdc(estimate),
    estimatedTimeSeconds: params.speed === "fast" ? 60 : 180,
  };
}

/** Poll destination USDC balance until mint is reflected (tolerates relay fee deduction). */
export async function completeCctpPayrollPayout(
  params: CompleteCctpPayoutParams
): Promise<CompleteCctpPayoutResult> {
  const dest = getDestinationByDomain(params.destinationDomain);
  if (!dest) {
    throw new Error(`Unsupported CCTP destination domain: ${params.destinationDomain}`);
  }

  const usdcAddress = DOMAIN_USDC[params.destinationDomain];
  if (!usdcAddress) {
    throw new Error(`No USDC address configured for domain ${params.destinationDomain}`);
  }

  const provider = new ethers.JsonRpcProvider(getChainRpcUrl({ name: dest.bridgeKitName }));
  const usdc = new ethers.Contract(usdcAddress, USDC_ABI, provider);

  const timeoutMs = params.timeoutMs ?? 180_000;
  const pollIntervalMs = params.pollIntervalMs ?? 5_000;
  const started = Date.now();

  const minIncrease =
    params.minExpectedWei ?? 1n; // forwarder relay fee varies — any mint counts

  const initialBalance: bigint = await usdc.balanceOf(params.recipient);
  const targetBalance = initialBalance + minIncrease;

  while (Date.now() - started < timeoutMs) {
    const current: bigint = await usdc.balanceOf(params.recipient);
    if (current >= targetBalance) {
      return {
        confirmed: true,
        destinationBalance: current,
        elapsedMs: Date.now() - started,
      };
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  const finalBalance: bigint = await usdc.balanceOf(params.recipient);
  return {
    confirmed: finalBalance >= targetBalance,
    destinationBalance: finalBalance,
    elapsedMs: Date.now() - started,
  };
}
