"use client";

import { useEffect, useState } from "react";
import {
  buildFeeBreakdown,
  type FeeBreakdown,
  type RoutingMethodUi,
  type TransferSpeedUi,
} from "@/lib/fees";
import {
  ARC_LOCAL_DOMAIN,
  ROUTING_CCTP,
  ROUTING_GATEWAY,
  TRANSFER_SPEED_FAST,
} from "@/lib/contracts/addresses";

interface Props {
  amount: string;
  destinationChainId: number;
  routingMethod: number;
  transferSpeed: number;
  fxSpreadBps?: number;
}

function toRoutingMethodUi(
  destinationChainId: number,
  routingMethod: number
): RoutingMethodUi {
  if (destinationChainId === ARC_LOCAL_DOMAIN) return "arc-local";
  return routingMethod === ROUTING_GATEWAY ? "gateway" : "cctp";
}

export function FeePanel({
  amount,
  destinationChainId,
  routingMethod,
  transferSpeed,
  fxSpreadBps = 0,
}: Props) {
  const [breakdown, setBreakdown] = useState<FeeBreakdown | null>(null);
  const [bridgeFeeUsdc, setBridgeFeeUsdc] = useState(0.05);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!amount || Number(amount) <= 0) {
      setBreakdown(null);
      return;
    }

    const routingUi = toRoutingMethodUi(destinationChainId, routingMethod);
    const speedUi: TransferSpeedUi =
      transferSpeed === TRANSFER_SPEED_FAST ? "fast" : "standard";

    async function load() {
      setLoading(true);
      let bridge = 0.05;
      if (routingUi === "cctp" && destinationChainId > 0) {
        try {
          const res = await fetch("/api/cross-chain/estimate-fee", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              amount,
              destinationChainId,
              transferSpeed: speedUi,
            }),
          });
          const data = await res.json();
          if (res.ok && data.bridgeFeeUsdc != null) {
            bridge = Number(data.bridgeFeeUsdc);
            setBridgeFeeUsdc(bridge);
          }
        } catch {
          // fall back
        }
      }

      const amountBase = BigInt(Math.round(Number(amount) * 1_000_000));
      setBreakdown(
        buildFeeBreakdown({
          amountBaseUnits: amountBase,
          routingMethod: routingUi,
          transferSpeed: speedUi,
          bridgeFeeUsdc: bridge,
          fxSpreadBps,
        })
      );
      setLoading(false);
    }

    void load();
  }, [amount, destinationChainId, routingMethod, transferSpeed, fxSpreadBps]);

  if (!amount || Number(amount) <= 0) {
    return (
      <div
        className="rounded-2xl border border-black/[0.07] bg-white p-3 text-xs text-black/35"
      >
        Enter an amount to see fee breakdown before confirming.
      </div>
    );
  }

  if (loading || !breakdown) {
    return (
      <div
        className="rounded-2xl border border-black/[0.07] bg-white p-3 text-xs text-black/45 animate-pulse"
      >
        Estimating fees…
      </div>
    );
  }

  const rows: [string, string][] = [
    ["Protocol fee", `${breakdown.protocolFee} USDC`],
    [
      "Gas (sponsored)",
      breakdown.gasSponsored
        ? `~${breakdown.gasFee} USDC (not deducted)`
        : `${breakdown.gasFee} USDC`,
    ],
  ];
  if (routingMethod === ROUTING_CCTP && destinationChainId > 0) {
    rows.push(["CCTP relay fee", `${breakdown.bridgeFee} USDC`]);
  }
  if (routingMethod === ROUTING_GATEWAY && destinationChainId > 0) {
    rows.push(["Gateway", "Unified balance spend"]);
  }
  if (fxSpreadBps > 0) {
    rows.push(["FX spread", `${breakdown.fxSpread} USDC`]);
  }
  rows.push(
    ["Total deducted", `${breakdown.totalFees} USDC`],
    ["Recipient receives (est.)", `${breakdown.netAmount} USDC`],
    ["Est. settlement", `~${breakdown.settlementSeconds}s`]
  );

  return (
    <div
      className="rounded-2xl border border-black/[0.07] bg-white p-4 flex flex-col gap-2"
      data-testid="fee-panel"
    >
      <p className="text-[11px] tracking-widest uppercase text-black/40">
        Fee transparency
      </p>
      {rows.map(([label, val]) => (
        <div key={label} className="flex justify-between text-sm">
          <span className="text-black/45">{label}</span>
          <span className="font-light tracking-tight text-[#111]">{val}</span>
        </div>
      ))}
      {routingMethod === ROUTING_CCTP && destinationChainId > 0 && (
        <p className="text-xs text-black/35 pt-1">
          CCTP relay fee is ~{bridgeFeeUsdc.toFixed(2)} USDC (varies by destination).
        </p>
      )}
      {routingMethod === ROUTING_CCTP &&
        destinationChainId > 0 &&
        Number(amount) > 0 &&
        Number(amount) <= bridgeFeeUsdc && (
          <p className="text-xs text-red-600 pt-1" role="alert">
            Amount must exceed the ~{bridgeFeeUsdc.toFixed(2)} USDC relay fee.
            Try at least {(bridgeFeeUsdc + 0.01).toFixed(2)} USDC.
          </p>
        )}
    </div>
  );
}
