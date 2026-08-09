"use client";

import { useCallback, useEffect, useState } from "react";
import { isAddress } from "viem";
import { useRemittanceWallet } from "@/components/RemittanceWalletContext";
import { RemittanceWalletConnector } from "@/components/RemittanceWalletConnector";
import { WalletFundPanel } from "@/components/WalletFundPanel";
import { BankFundPanel } from "@/components/BankFundPanel";
import { BankMockFundPanel } from "@/components/BankMockFundPanel";
import { DestinationPicker } from "@/components/DestinationPicker";
import { RecipientInput } from "@/components/RecipientInput";
import { FeePanel } from "@/components/FeePanel";
import { ComparisonStrip } from "@/components/ComparisonStrip";
import { SettlementTracker, type RemitLegs } from "@/components/SettlementTracker";
import { ReceiptDownload } from "@/components/ReceiptDownload";
import { TxStatusBadge } from "@/components/TxStatusBadge";
import { FxQuoteCard, type FxQuoteView } from "@/components/FxQuoteCard";
import { StableFxProgressPanel } from "@/components/StableFxProgressPanel";
import {
  ARC_EXPLORER_URL,
  ARC_LOCAL_DOMAIN,
  ROUTING_CCTP,
  ROUTING_GATEWAY,
  TRANSFER_SPEED_FAST,
  destinationLabel,
  getDestinationExplorerBase,
} from "@/lib/contracts/addresses";
import {
  bankMockChainToDomain,
  domainToPayoutChain,
  type BankMockPayoutChain,
} from "@/lib/circle/supported-chains";
import type { TxStatus } from "@/lib/types";
import { remitDebug, remitDebugFetch } from "@/lib/remit-debug";
import { executeCircleChallenge } from "@/lib/circle/execute-challenge";

type FundingPath = "A" | "B" | "B_MOCK";
type Step = "fund" | "convert" | "send" | "track";

export default function RemitPage() {
  const { wallet, setWallet } = useRemittanceWallet();
  const [fundingPath, setFundingPath] = useState<FundingPath>("A");
  const [step, setStep] = useState<Step>("fund");
  const [balanceKey, setBalanceKey] = useState(0);
  const [ledgerUsdc, setLedgerUsdc] = useState<string | null>(null);
  const [bankMockMeta, setBankMockMeta] = useState<{
    aedAmount: string;
    usdcAmount: string;
    rate: number;
    usdToAed: number;
    recipientAddress: string;
    chain: BankMockPayoutChain;
    recipientBank: { bankName: string; accountOrIban: string; swift?: string };
  } | null>(null);
  const [aedSettledDisplay, setAedSettledDisplay] = useState<string | null>(null);

  const [convertAmount, setConvertAmount] = useState("10");
  const [fromCurrency, setFromCurrency] = useState<"USDC" | "EURC">("USDC");
  const [toCurrency, setToCurrency] = useState<"USDC" | "EURC">("EURC");
  const [fxQuote, setFxQuote] = useState<FxQuoteView | null>(null);
  const [fxLoading, setFxLoading] = useState(false);
  const [fxError, setFxError] = useState<string | null>(null);
  const [fxSpreadBps, setFxSpreadBps] = useState(0);
  const [fxProgress, setFxProgress] = useState<
    Array<{ stage: string; message: string; elapsedMs?: number }>
  >([]);
  const [fxSettling, setFxSettling] = useState(false);

  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [sendCurrency, setSendCurrency] = useState<"USDC" | "EURC">("USDC");
  const [destinationChainId, setDestinationChainId] = useState(6);
  const [routingMethod, setRoutingMethod] = useState(ROUTING_CCTP);
  const [transferSpeed, setTransferSpeed] = useState(TRANSFER_SPEED_FAST);
  const [deliveryMode, setDeliveryMode] = useState<"crypto" | "fiat">("crypto");
  const [fiatBankId, setFiatBankId] = useState("");
  const [compliance, setCompliance] = useState<string | null>(null);
  const [txStatus, setTxStatus] = useState<TxStatus>({ status: "idle" });
  const [remittanceId, setRemittanceId] = useState<string | null>(null);
  const [settled, setSettled] = useState(false);
  const [legs, setLegs] = useState<RemitLegs>({});

  const isCrossChain = destinationChainId !== ARC_LOCAL_DOMAIN;
  // CCTP / Gateway are USDC-only; EURC Path A is Arc same-chain (or Path B Payouts).
  const eurcCrossChainBlocked =
    fundingPath === "A" && sendCurrency === "EURC" && isCrossChain;

  useEffect(() => {
    if (wallet) setStep("fund");
  }, [wallet]);

  const refreshFxQuote = useCallback(async () => {
    if (fromCurrency === toCurrency) {
      setFxError("Choose two different currencies");
      setFxQuote(null);
      return;
    }
    if (!convertAmount || Number(convertAmount) < 10) {
      setFxQuote(null);
      setFxError(Number(convertAmount) > 0 ? `Minimum 10 ${fromCurrency}` : null);
      return;
    }
    setFxLoading(true);
    setFxError(null);
    try {
      const res = await fetch("/api/fx/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: convertAmount,
          fromCurrency,
          toCurrency,
          userId: wallet?.userId,
          userToken: fundingPath === "A" ? wallet?.userToken : undefined,
          walletId: fundingPath === "A" ? wallet?.walletId : undefined,
          skipBalanceCheck: fundingPath === "B" || fundingPath === "B_MOCK",
          fundingPath,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Quote failed");
      setFxQuote({
        id: data.id,
        fromCurrency: data.fromCurrency ?? fromCurrency,
        fromAmount: data.fromAmount ?? convertAmount,
        toCurrency: data.toCurrency ?? toCurrency,
        toAmount: data.toAmount,
        rate: data.rate,
        fee: data.fee,
        fxSpreadBps: data.fxSpreadBps ?? 0,
        expiresAt: data.expiresAt,
        pair: data.pair,
      });
      setFxSpreadBps(data.fxSpreadBps ?? 0);
    } catch (err: unknown) {
      setFxQuote(null);
      setFxError(err instanceof Error ? err.message : String(err));
    } finally {
      setFxLoading(false);
    }
  }, [convertAmount, fromCurrency, toCurrency, fundingPath, wallet?.userId]);

  useEffect(() => {
    if (step !== "convert") return;
    const t = setTimeout(() => void refreshFxQuote(), 400);
    return () => clearTimeout(t);
  }, [step, convertAmount, fromCurrency, toCurrency, refreshFxQuote]);

  async function checkCompliance(address: string) {
    const res = await remitDebugFetch(
      "send.compliance",
      `/api/circle/compliance/screen?address=${encodeURIComponent(address)}`
    );
    const data = await res.json();
    setCompliance(data.allowed ? "Address cleared" : data.reason);
    return data.allowed as boolean;
  }

  async function settleFxOptional() {
    if (!fxQuote || !wallet) return;
    if (!wallet.userToken || !wallet.encryptionKey) {
      setTxStatus({ status: "error", error: "Sign in required for convert" });
      return;
    }

    setFxSettling(true);
    setFxProgress([]);
    setTxStatus({ status: "pending", detail: "Settling StableFX…" });

    try {
      // Path A: StableFX signs with facilitator EOA — debit from-currency from wallet first,
      // then after swap send to-currency back so Fund panel balances update.
      if (fundingPath === "A") {
        const debitCurrency = fxQuote.fromCurrency;
        setFxProgress((p) => [
          ...p,
          {
            stage: "path_a_debit",
            message: `Preparing ${debitCurrency} transfer to facilitator…`,
          },
        ]);
        const prepRes = await fetch("/api/fx/path-a/prepare-debit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userToken: wallet.userToken,
            walletId: wallet.walletId,
            amount: fxQuote.fromAmount,
            currency: debitCurrency,
          }),
        });
        const prep = await prepRes.json();
        if (!prepRes.ok) throw new Error(prep.error ?? "Path A debit prepare failed");

        setFxProgress((p) => [
          ...p,
          {
            stage: "path_a_debit",
            message: `Approve Circle challenge to send ${debitCurrency} to facilitator…`,
          },
        ]);
        setTxStatus({
          status: "pending",
          detail: "Approve wallet challenge to fund StableFX…",
        });
        await executeCircleChallenge({
          userToken: wallet.userToken,
          encryptionKey: wallet.encryptionKey,
          challengeId: prep.challengeId,
        });

        setFxProgress((p) => [
          ...p,
          {
            stage: "path_a_debit",
            message: `Waiting for ${debitCurrency} debit confirmation…`,
          },
        ]);
        const waitRes = await fetch("/api/fx/path-a/wait-debit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            walletId: wallet.walletId,
            facilitatorAddress: prep.facilitatorAddress,
            amount: fxQuote.fromAmount,
          }),
        });
        const waitData = await waitRes.json();
        if (!waitRes.ok) throw new Error(waitData.error ?? "Path A debit wait failed");
        setFxProgress((p) => [
          ...p,
          {
            stage: "path_a_debit",
            message: `${debitCurrency} received by facilitator${waitData.txHash ? ` · ${String(waitData.txHash).slice(0, 12)}…` : ""}`,
          },
        ]);
      }

      const fxRes = await fetch("/api/fx/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quoteId: fxQuote.id,
          userId: fundingPath === "A" ? wallet.userId : undefined,
          useEoaSigner: true,
          deliverToAddress: fundingPath === "A" ? wallet.address : undefined,
        }),
      });

      if (!fxRes.body) {
        const fallback = await fxRes.json().catch(() => ({}));
        throw new Error(
          (fallback as { error?: string }).error ?? "StableFX execute returned no body"
        );
      }

      const reader = fxRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let donePayload: Record<string, unknown> | null = null;
      let errorMessage: string | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          let event: Record<string, unknown>;
          try {
            event = JSON.parse(trimmed) as Record<string, unknown>;
          } catch {
            continue;
          }
          const stage = String(event.stage ?? "");
          const message = String(event.message ?? event.error ?? "");
          if (stage && stage !== "done") {
            setFxProgress((prev) => [
              ...prev,
              {
                stage,
                message,
                elapsedMs:
                  typeof event.elapsedMs === "number" ? event.elapsedMs : undefined,
              },
            ]);
            setTxStatus({
              status: "pending",
              detail: `${stage}: ${message}`,
            });
          }
          if (stage === "error") {
            errorMessage = String(event.error ?? event.message ?? "StableFX failed");
          }
          if (stage === "done") {
            donePayload = event;
          }
        }
      }

      if (errorMessage) throw new Error(errorMessage);
      if (!donePayload) throw new Error("StableFX stream ended without a result");

      setLegs((prev) => ({
        ...prev,
        funding:
          prev.funding ??
          (fundingPath === "A"
            ? { status: "complete", path: "A", walletAddress: wallet.address }
            : { status: "complete", path: "B", amount: convertAmount }),
        fx: {
          status: "complete",
          tradeId: String(donePayload.stablefxTradeId ?? ""),
          settlementTxHash: donePayload.settlementTransactionHash
            ? String(donePayload.settlementTransactionHash)
            : undefined,
          feeUsdc: donePayload.feeUsdc ? String(donePayload.feeUsdc) : undefined,
          rate: fxQuote.rate,
        },
      }));
      setFxSpreadBps(
        typeof donePayload.fxSpreadBps === "number"
          ? donePayload.fxSpreadBps
          : fxSpreadBps
      );
      setTxStatus({
        status: "success",
        detail: `Converted · ${String(donePayload.status ?? "settled")}`,
        hash: donePayload.settlementTransactionHash
          ? String(donePayload.settlementTransactionHash)
          : undefined,
      });
      setBalanceKey((k) => k + 1);
    } finally {
      setFxSettling(false);
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!wallet?.userToken || !wallet.walletId || !wallet.encryptionKey) {
      setTxStatus({ status: "error", error: "Sign in required" });
      return;
    }

    setTxStatus({ status: "pending" });
    setSettled(false);
    setStep("track");

    try {
      // Path A is crypto-onchain only; fiat bank withdraw is Path B (if selected).
      if (fundingPath !== "A" && deliveryMode === "fiat") {
        if (!fiatBankId) throw new Error("Destination bank id required for fiat payout");
        const remitRes = await fetch("/api/remittances", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            senderAddress: wallet.address,
            recipientAddress: fiatBankId,
            amount: String(Math.round(Number(amount || convertAmount) * 1_000_000)),
            routingMethod: ROUTING_GATEWAY,
            status: "pending",
          }),
        });
        const remitData = await remitRes.json();
        if (!remitRes.ok) throw new Error(remitData.error ?? "Remittance create failed");
        const id = remitData.remittance?.id as string;
        setRemittanceId(id);

        const fiatRes = await fetch("/api/remit/fiat/payout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: amount || convertAmount,
            destinationBankId: fiatBankId,
            remittanceId: id,
          }),
        });
        const fiatData = await fiatRes.json();
        if (!fiatRes.ok) throw new Error(fiatData.error ?? "Fiat payout failed");
        setLegs((prev) => ({
          ...prev,
          funding:
            prev.funding ?? {
              status: "complete",
              path: "B",
              amount: amount || convertAmount,
            },
          delivery: {
            status: "pending",
            mode: "fiat",
            method: "bank",
            payoutId: fiatData.payoutId,
          },
          payout: { status: "pending", payoutId: fiatData.payoutId },
        }));
        setTxStatus({ status: "success", detail: `Fiat payout ${fiatData.status}` });
        setSettled(true);
        return;
      }

      if (!isAddress(recipient) || !amount) {
        throw new Error("Valid recipient and amount required");
      }
      const allowed = await checkCompliance(recipient);
      if (!allowed) throw new Error(compliance ?? "Address blocked");

      // Path B / Bank-mock crypto → Payouts API
      if (fundingPath === "B" || fundingPath === "B_MOCK") {
        const payoutChain =
          fundingPath === "B_MOCK" && bankMockMeta
            ? bankMockMeta.chain
            : domainToPayoutChain(destinationChainId);

        const recipRes = await fetch("/api/remit/recipients", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            address: recipient,
            chain: payoutChain,
            currency: sendCurrency,
          }),
        });
        const recipData = await recipRes.json();
        if (!recipRes.ok) throw new Error(recipData.error ?? "Recipient register failed");

        const remitRes = await fetch("/api/remittances", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            senderAddress: wallet.address,
            recipientAddress: recipient,
            amount: String(Math.round(Number(amount) * 1_000_000)),
            destinationChainId: bankMockChainToDomain(payoutChain),
            routingMethod: ROUTING_GATEWAY,
            status: "pending",
            metadata:
              fundingPath === "B_MOCK" && bankMockMeta
                ? {
                    path: "B_MOCK",
                    aedAmount: bankMockMeta.aedAmount,
                    usdcAmount: bankMockMeta.usdcAmount,
                    rate: bankMockMeta.rate,
                    usdToAed: bankMockMeta.usdToAed,
                    label: "Bank-mock",
                  }
                : undefined,
          }),
        });
        const remitData = await remitRes.json();
        if (!remitRes.ok) throw new Error(remitData.error ?? "Remittance create failed");
        const id = remitData.remittance?.id as string;
        setRemittanceId(id);

        const payoutRes = await fetch("/api/remit/payouts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipientId: recipData.recipientId,
            amount,
            currency: sendCurrency,
            remittanceId: id,
            chain: payoutChain,
          }),
        });
        const payoutData = await payoutRes.json();
        if (!payoutRes.ok) throw new Error(payoutData.error ?? "Payout failed");

        let aedOut: string | null = null;
        if (fundingPath === "B_MOCK" && bankMockMeta) {
          aedOut = (Number(amount) * bankMockMeta.usdToAed).toFixed(2);
          setAedSettledDisplay(aedOut);
        }

        setLegs((prev) => ({
          ...prev,
          funding: {
            status: "complete",
            path: fundingPath === "B_MOCK" ? "B_MOCK" : "B",
            amount: ledgerUsdc ?? amount,
            aedAmount: bankMockMeta?.aedAmount,
            aedReceived: aedOut ?? undefined,
          },
          custody: { status: "complete", balanceUsdc: ledgerUsdc ?? amount },
          delivery: {
            status: "pending",
            mode: "crypto",
            method: "payouts",
            payoutId: payoutData.payoutId,
            txHash: payoutData.txHash,
          },
          payout: { status: "pending", payoutId: payoutData.payoutId, txHash: payoutData.txHash },
        }));
        setTxStatus({
          status: "pending",
          detail:
            fundingPath === "B_MOCK" && aedOut && bankMockMeta
              ? `${aedOut} AED en route to ${bankMockMeta.recipientBank.bankName}`
              : "Payouts API initiated",
          hash: payoutData.txHash,
        });
        return;
      }

      // Path A crypto — CCTP / Gateway / local (7d3ac6b pattern)
      if (sendCurrency === "EURC" && isCrossChain) {
        throw new Error(
          "EURC cross-chain is not supported on Path A (CCTP/Gateway are USDC-only). Choose Arc (local) or Path B Payouts."
        );
      }

      const remitRes = await remitDebugFetch("send.remittance.create", "/api/remittances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderAddress: wallet.address,
          recipientAddress: recipient,
          amount: String(Math.round(Number(amount) * 1_000_000)),
          destinationChainId,
          routingMethod: sendCurrency === "EURC" ? ROUTING_CCTP : routingMethod,
          status: "pending",
        }),
      });
      const remitData = await remitRes.json();
      if (!remitRes.ok) throw new Error(remitData.error ?? "Failed to create remittance");
      const id = remitData.remittance?.id as string;
      setRemittanceId(id);

      const deliveryMethod = !isCrossChain
        ? "local"
        : routingMethod === ROUTING_GATEWAY
          ? "gateway"
          : "cctp";

      setLegs((prev) => ({
        ...prev,
        funding: {
          status: "complete",
          path: "A",
          walletAddress: wallet.address,
        },
        custody: { status: "complete", walletId: wallet.walletId },
        delivery: { status: "pending", mode: "crypto", method: deliveryMethod },
        payout: { status: "pending" },
      }));

      const crossChainBody = {
        userToken: wallet.userToken,
        walletId: wallet.walletId,
        recipient,
        amount,
        destinationChainId,
        routingMethod,
        transferSpeed: transferSpeed === TRANSFER_SPEED_FAST ? "fast" : "standard",
      };

      let data: {
        transactionId?: string;
        txHash?: string;
        burnTxHash?: string;
        spendTxHash?: string;
        arcTxHash?: string;
        bridgeFeeUsdc?: string;
        challengeId?: string;
        error?: string;
      };

      if (isCrossChain) {
        const prepareRes = await remitDebugFetch(
          "send.cross_chain.prepare",
          "/api/circle/remit/cross-chain",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...crossChainBody, phase: "prepare" }),
          }
        );
        const prepareData = await prepareRes.json();
        if (!prepareRes.ok) throw new Error(prepareData.error ?? "Prepare failed");

        await executeCircleChallenge({
          userToken: wallet.userToken!,
          encryptionKey: wallet.encryptionKey!,
          challengeId: prepareData.challengeId,
        });

        const bridgeRes = await remitDebugFetch(
          "send.cross_chain.bridge",
          "/api/circle/remit/cross-chain",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...crossChainBody, phase: "bridge" }),
          }
        );
        data = await bridgeRes.json();
        if (!bridgeRes.ok) throw new Error(data.error ?? "Bridge failed");
      } else {
        const prepareRes = await remitDebugFetch("send.same_chain.prepare", "/api/circle/remit/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
          userToken: wallet.userToken,
            walletId: wallet.walletId,
          recipient,
          amount,
            currency: sendCurrency,
            phase: "prepare",
          }),
        });
        const prepareData = await prepareRes.json();
        if (!prepareRes.ok) throw new Error(prepareData.error ?? "Prepare failed");

        await executeCircleChallenge({
          userToken: wallet.userToken!,
          encryptionKey: wallet.encryptionKey!,
          challengeId: prepareData.challengeId,
        });

        const completeRes = await remitDebugFetch(
          "send.same_chain.complete",
          "/api/circle/remit/send",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userToken: wallet.userToken,
              walletId: wallet.walletId,
              recipient,
              amount,
              currency: sendCurrency,
              phase: "complete",
            }),
          }
        );
        data = await completeRes.json();
        if (!completeRes.ok) throw new Error(data.error ?? "Send failed");
      }

      // Gateway mint lives on the destination chain (e.g. Base Sepolia) — not Arc.
      // CCTP burn / Arc-local debit are Arc txs.
      const destinationMintHash = data.spendTxHash;
      const arcHash = data.arcTxHash ?? data.burnTxHash;
      const onChainHash =
        destinationMintHash ??
        data.txHash ??
        data.burnTxHash ??
        data.transactionId ??
        "";
      const explorerBase = destinationMintHash
        ? getDestinationExplorerBase(destinationChainId)
        : ARC_EXPLORER_URL;
      const chainLabel = destinationMintHash
        ? destinationLabel(destinationChainId)
        : "Arc";
        const bridgeFeeMicro = data.bridgeFeeUsdc
          ? String(Math.round(Number(data.bridgeFeeUsdc) * 1_000_000))
          : undefined;

        await remitDebugFetch("send.remittance.confirm", `/api/remittances/${id}/confirm`, {
        method: "POST",
          headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            txHash: onChainHash.startsWith("0x") ? onChainHash : data.transactionId,
          fee: bridgeFeeMicro,
        }),
      }).catch(() => undefined);

      setLegs((prev) => ({
        ...prev,
        delivery: {
          status: "complete",
          mode: "crypto",
          method: deliveryMethod,
          txHash: onChainHash,
          explorerBase,
          chainLabel,
        },
        payout: {
          status: "complete",
          txHash: onChainHash,
        },
      }));
      setTxStatus({
        status: "success",
        hash: onChainHash,
        explorerBase,
        chainLabel,
        detail: arcHash && destinationMintHash
          ? `Arc debit ${arcHash.slice(0, 10)}…`
          : undefined,
      });
      setSettled(true);
    } catch (err: any) {
      remitDebug("send.error", { message: err.message });
      setTxStatus({ status: "error", error: err.message });
    }
  }

  const inputClass = "w-full mt-1.5 rounded-xl border px-3 py-2.5 text-sm";
  const inputStyle = { background: "var(--bg-input)", borderColor: "var(--border)" };

  return (
    <div className="flex flex-col gap-8 max-w-2xl mx-auto">
      <div>
        <h1 className="text-3xl md:text-4xl font-light tracking-tight text-[#111]">Send Money</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Dual-rail: wallet (Path A), bank wire (Path B), or AED bank-mock → optional StableFX →
          crypto or fiat delivery
        </p>
      </div>

      {!wallet ? (
        <div data-testid="signin-prompt">
          <RemittanceWalletConnector onReady={setWallet} />
        </div>
      ) : null}

      {wallet && (
        <>
          <div className="flex flex-wrap gap-2" data-testid="funding-path-toggle">
            {(
              [
                ["A", "Path A · Wallet"],
                ["B", "Path B · Bank"],
                ["B_MOCK", "Path B · Bank-mock"],
              ] as const
            ).map(([p, label]) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  setFundingPath(p);
                  setStep("fund");
                  if (p === "A") setDeliveryMode("crypto");
                  if (p !== "B_MOCK") {
                    setBankMockMeta(null);
                    setAedSettledDisplay(null);
                  }
                }}
                className="px-3 py-1.5 rounded-xl text-xs tracking-wide border"
                style={{
                  borderColor: fundingPath === p ? "rgba(0,0,0,0.2)" : "var(--border)",
                  color: fundingPath === p ? "#111" : "var(--text-secondary)",
                  background: fundingPath === p ? "rgba(0,0,0,0.06)" : "transparent",
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <nav className="flex flex-wrap gap-2" data-testid="remit-stepper">
            {(fundingPath === "B_MOCK"
              ? ([["fund", "Fund"], ["track", "Track"]] as const)
              : ([
                  ["fund", "Fund"],
                  ["convert", "Convert"],
                  ["send", "Send"],
                  ["track", "Track"],
                ] as const)
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setStep(id)}
                className="px-3 py-1.5 rounded-xl text-xs tracking-wide border"
                style={{
                  borderColor: step === id ? "rgba(0,0,0,0.2)" : "var(--border)",
                  color: step === id ? "#111" : "var(--text-secondary)",
                  background: step === id ? "rgba(0,0,0,0.06)" : "transparent",
                }}
                data-testid={`step-${id}`}
              >
                {label}
              </button>
            ))}
          </nav>

          {step === "fund" && (
            <section
              className="rounded-2xl border p-6 flex flex-col gap-4"
              style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
            >
              {fundingPath === "A" ? (
                <WalletFundPanel
                  userToken={wallet.userToken}
                  walletId={wallet.walletId}
                  address={wallet.address}
                  refreshKey={balanceKey}
                />
              ) : fundingPath === "B_MOCK" ? (
                <BankMockFundPanel
                  userId={wallet.userId}
                  onFunded={(info) => {
                    void (async () => {
                      const destDomain = bankMockChainToDomain(info.chain);
                      const explorerBase = getDestinationExplorerBase(destDomain);
                      setLedgerUsdc(info.usdcAmount);
                      setAmount(info.usdcAmount);
                      setRecipient(info.recipientAddress);
                      setDestinationChainId(destDomain);
                      setSendCurrency("USDC");
                      setDeliveryMode("crypto");
                      setBankMockMeta({
                        aedAmount: info.aedAmount,
                        usdcAmount: info.usdcAmount,
                        rate: info.rate,
                        usdToAed: info.usdToAed,
                        recipientAddress: info.recipientAddress,
                        chain: info.chain,
                        recipientBank: {
                          bankName: info.recipientBank.bankName,
                          accountOrIban: info.recipientBank.accountOrIban,
                          swift: info.recipientBank.swift || undefined,
                        },
                      });
                      setAedSettledDisplay(null);
                      setSettled(false);
                      setTxStatus({
                        status: "pending",
                        detail: "Sending AED to recipient bank…",
                        explorerBase,
                      });
                      setLegs({
                        funding: {
                          status: "complete",
                          path: "B_MOCK",
                          amount: info.usdcAmount,
                          aedAmount: info.aedAmount,
                        },
                        custody: {
                          status: "complete",
                          balanceUsdc: info.usdcAmount,
                        },
                        delivery: {
                          status: "pending",
                          mode: "crypto",
                          method: "payouts",
                          explorerBase,
                        },
                        payout: { status: "pending" },
                      });
                      setStep("track");

                      try {
                        const allowed = await checkCompliance(info.recipientAddress);
                        if (!allowed) {
                          throw new Error(compliance ?? "Recipient address blocked");
                        }

                        const recipRes = await fetch("/api/remit/recipients", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            address: info.recipientAddress,
                            chain: info.chain,
                            currency: "USDC",
                          }),
                        });
                        const recipData = await recipRes.json();
                        if (!recipRes.ok) {
                          throw new Error(recipData.error ?? "Recipient register failed");
                        }

                        const remitRes = await fetch("/api/remittances", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            senderAddress: wallet.address,
                            recipientAddress: info.recipientAddress,
                            amount: String(Math.round(Number(info.usdcAmount) * 1_000_000)),
                            destinationChainId: destDomain,
                            routingMethod: ROUTING_GATEWAY,
                            status: "pending",
                          }),
                        });
                        const remitData = await remitRes.json();
                        if (!remitRes.ok) {
                          throw new Error(remitData.error ?? "Remittance create failed");
                        }
                        const id = remitData.remittance?.id as string;
                        setRemittanceId(id);

                        const payoutRes = await fetch("/api/remit/payouts", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            recipientId: recipData.recipientId,
                            amount: info.usdcAmount,
                            currency: "USDC",
                            remittanceId: id,
                            chain: info.chain,
                          }),
                        });
                        const payoutData = await payoutRes.json();
                        if (!payoutRes.ok) {
                          throw new Error(payoutData.error ?? "Payout failed");
                        }

                        const aedOut = (
                          Number(info.usdcAmount) * info.usdToAed
                        ).toFixed(2);
                        setAedSettledDisplay(aedOut);
                        setLegs((prev) => ({
                          ...prev,
                          funding: {
                            ...prev.funding!,
                            status: "complete",
                            path: "B_MOCK",
                            amount: info.usdcAmount,
                            aedAmount: info.aedAmount,
                            aedReceived: aedOut,
                          },
                          delivery: {
                            status: "complete",
                            mode: "crypto",
                            method: "payouts",
                            payoutId: payoutData.payoutId,
                            txHash: payoutData.txHash,
                            explorerBase,
                          },
                          payout: {
                            status: "complete",
                            payoutId: payoutData.payoutId,
                            txHash: payoutData.txHash,
                          },
                        }));
                        setTxStatus({
                          status: "success",
                          detail: `${aedOut} AED reached ${info.recipientBank.bankName}`,
                          hash: payoutData.txHash,
                          explorerBase,
                        });
                        setSettled(true);
                      } catch (err: unknown) {
                        const message =
                          err instanceof Error ? err.message : String(err);
                        setLegs((prev) => ({
                          ...prev,
                          delivery: { status: "failed", mode: "crypto", method: "payouts" },
                          payout: { status: "failed" },
                        }));
                        setTxStatus({ status: "error", error: message });
                      }
                    })();
                  }}
                />
              ) : (
                <BankFundPanel
                  userId={wallet.userId}
                  onFunded={(info) => {
                    setLedgerUsdc(info.availableLedgerUsdc);
                    setLegs((prev) => ({
                      ...prev,
                      funding: {
                        status: "complete",
                        path: "B",
                        amount: info.availableLedgerUsdc,
                      },
                      payin: { status: "complete", amount: info.availableLedgerUsdc },
                      custody: {
                        status: "complete",
                        balanceUsdc: info.availableLedgerUsdc,
                      },
                    }));
                  }}
                />
              )}
              {fundingPath !== "B_MOCK" && (
                <button
                  type="button"
                  className="w-full py-2.5 rounded-xl text-sm tracking-wide text-white"
                  style={{ background: "var(--dot-pink)" }}
                  onClick={() => {
                    setBalanceKey((k) => k + 1);
                    if (fundingPath === "A") {
                      setLegs((prev) => ({
                        ...prev,
                        funding: {
                          status: "complete",
                          path: "A",
                          walletAddress: wallet.address,
                        },
                        custody: { status: "complete", walletId: wallet.walletId },
                      }));
                    }
                    setStep("convert");
                  }}
                  data-testid="fund-continue"
                >
                  Continue
                </button>
              )}
            </section>
          )}

          {step === "convert" && fundingPath !== "B_MOCK" && (
            <section
              className="rounded-2xl border p-6 flex flex-col gap-4"
              style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
            >
              <p className="text-xs text-[var(--text-secondary)]">
                Optional StableFX. Path A debits your chosen currency to the facilitator, swaps via
                StableFX, then sends the output token back to your wallet (approve the Circle
                challenge when prompted).
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[var(--text-secondary)]">From</label>
                  <select
                    className={inputClass}
                    style={inputStyle}
                    value={fromCurrency}
                    onChange={(e) => {
                      const v = e.target.value as "USDC" | "EURC";
                      setFromCurrency(v);
                      if (v === toCurrency) setToCurrency(v === "USDC" ? "EURC" : "USDC");
                    }}
                  >
                    <option value="USDC">USDC</option>
                    <option value="EURC">EURC</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-[var(--text-secondary)]">To</label>
                  <select
                    className={inputClass}
                    style={inputStyle}
                    value={toCurrency}
                    onChange={(e) => {
                      const v = e.target.value as "USDC" | "EURC";
                      setToCurrency(v);
                      if (v === fromCurrency) setFromCurrency(v === "USDC" ? "EURC" : "USDC");
                    }}
                  >
                    <option value="EURC">EURC</option>
                    <option value="USDC">USDC</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-[var(--text-secondary)]">Amount ({fromCurrency})</label>
                <input
                  type="number"
                  min="10"
                  step="0.01"
                  className={inputClass}
                  style={inputStyle}
                  value={convertAmount}
                  onChange={(e) => setConvertAmount(e.target.value)}
                />
              </div>
              <FxQuoteCard
                quote={fxQuote}
                loading={fxLoading}
                error={fxError}
                onExpired={() => void refreshFxQuote()}
              />
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  disabled={!fxQuote || fxLoading || fxSettling}
                  className="flex-1 py-2.5 rounded-xl text-sm tracking-wide text-white disabled:opacity-50"
                  style={{ background: "var(--dot-pink)" }}
                  onClick={() =>
                    void settleFxOptional()
                      .then(() => setStep("send"))
                      .catch((err) =>
                        setTxStatus({ status: "error", error: err.message })
                      )
                  }
                >
                  {fxSettling ? "Settling…" : "Convert & continue"}
                </button>
                <button
                  type="button"
                  disabled={fxSettling}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium border"
                  style={{ borderColor: "var(--border)" }}
                  onClick={() => {
                    setFxQuote(null);
                    setFxSpreadBps(0);
                    setStep("send");
                  }}
                >
                  Skip convert
                </button>
              </div>
              <StableFxProgressPanel steps={fxProgress} active={fxSettling} />
              <TxStatusBadge status={txStatus} />
            </section>
          )}

          {step === "send" && fundingPath !== "B_MOCK" && (
            <form
              onSubmit={handleSend}
              className="rounded-2xl border p-6 flex flex-col gap-5"
              style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
            >
              <div>
                <label className="text-xs text-[var(--text-secondary)]">Delivery</label>
                {fundingPath === "A" ? (
                  <p
                    className={`${inputClass} flex items-center`}
                    style={inputStyle}
                    data-testid="delivery-mode"
                  >
                    Crypto onchain
                  </p>
                ) : (
                  <select
                    className={inputClass}
                    style={inputStyle}
                    value={deliveryMode}
                    onChange={(e) => setDeliveryMode(e.target.value as "crypto" | "fiat")}
                    data-testid="delivery-mode"
                  >
                    <option value="crypto">Crypto onchain</option>
                    <option value="fiat">Fiat bank withdraw</option>
                  </select>
                )}
              </div>

              {(fundingPath === "A" || deliveryMode === "crypto") ? (
                <>
          <RecipientInput
            value={recipient}
                    onChange={(v) => {
                      setRecipient(v);
                      setCompliance(null);
                    }}
                    onResolved={(addr) => void checkCompliance(addr)}
            disabled={txStatus.status === "pending"}
          />
          {compliance && (
                    <p
                      className="text-xs"
                      style={{
                        color:
                          compliance === "Address cleared" ? "var(--success)" : "var(--error)",
                      }}
                    >
              {compliance}
            </p>
          )}
                  <div className="grid grid-cols-2 gap-3">
          <div>
                      <label className="text-xs text-[var(--text-secondary)]">Currency</label>
                      <select
                        className={inputClass}
                        style={inputStyle}
                        value={sendCurrency}
                        data-testid="send-currency"
                        onChange={(e) => {
                          const next = e.target.value as "USDC" | "EURC";
                          setSendCurrency(next);
                          // EURC Path A: Arc local only (CCTP/Gateway are USDC)
                          if (fundingPath === "A" && next === "EURC") {
                            setDestinationChainId(ARC_LOCAL_DOMAIN);
                          }
                        }}
                        disabled={txStatus.status === "pending"}
                      >
                        <option value="USDC">USDC</option>
                        <option value="EURC">EURC</option>
                      </select>
          </div>
                    <div>
                      <label className="text-xs text-[var(--text-secondary)]">
                        Amount ({sendCurrency})
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        required
                        className={inputClass}
                        style={inputStyle}
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        data-testid="send-amount"
                      />
                    </div>
                  </div>
                  {fundingPath === "A" && sendCurrency === "EURC" && (
                    <p className="text-xs text-[var(--text-muted)]">
                      EURC on Path A is Arc same-chain only. Use Convert for USDC↔EURC, or Path B
                      Payouts for EURC on other chains.
                    </p>
                  )}
          <DestinationPicker
            value={destinationChainId}
                    onChange={(domain) => {
                      if (fundingPath === "A" && sendCurrency === "EURC" && domain !== ARC_LOCAL_DOMAIN) {
                        setTxStatus({
                          status: "error",
                          error:
                            "EURC Path A is Arc-only. Switch currency to USDC for CCTP/Gateway.",
                        });
                        setDestinationChainId(ARC_LOCAL_DOMAIN);
                        return;
                      }
                      setDestinationChainId(domain);
                    }}
            disabled={txStatus.status === "pending"}
          />
                  {eurcCrossChainBlocked && (
                    <p className="text-xs" style={{ color: "var(--error)" }}>
                      Switch destination to Arc (local) to send EURC on Path A.
                    </p>
                  )}
                  {fundingPath === "A" && isCrossChain && sendCurrency === "USDC" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-[var(--text-secondary)]">Routing</label>
                        <select
                          className="w-full mt-1 rounded-lg border px-3 py-2 text-sm"
                          style={inputStyle}
                        value={routingMethod}
                          onChange={(e) => setRoutingMethod(Number(e.target.value))}
                          data-testid="routing-method"
                        >
                  <option value={ROUTING_CCTP}>CCTP</option>
                  <option value={ROUTING_GATEWAY}>Gateway</option>
                </select>
              </div>
              {routingMethod === ROUTING_CCTP && (
                <div>
                  <label className="text-xs text-[var(--text-secondary)]">Speed</label>
                          <select
                            className="w-full mt-1 rounded-lg border px-3 py-2 text-sm"
                            style={inputStyle}
                          value={transferSpeed}
                            onChange={(e) => setTransferSpeed(Number(e.target.value))}
                          >
                    <option value={TRANSFER_SPEED_FAST}>Fast (~20s)</option>
                    <option value={0}>Standard</option>
                  </select>
                </div>
              )}
            </div>
          )}
                  {fundingPath === "B" && (
                    <p className="text-xs text-[var(--text-muted)]">
                      Path B crypto uses Circle Stablecoin Payouts (no CCTP/Gateway on your side).
                    </p>
                  )}
                  {fundingPath === "A" && (
          <FeePanel
            amount={amount}
            destinationChainId={destinationChainId}
            routingMethod={routingMethod}
            transferSpeed={transferSpeed}
                      fxSpreadBps={fxSpreadBps}
                    />
                  )}
                </>
              ) : (
                <>
                  <div>
                    <label className="text-xs text-[var(--text-secondary)]">
                      Destination bank id (Mint wire account)
                    </label>
                    <input
                      className={inputClass}
                      style={inputStyle}
                      value={fiatBankId}
                      onChange={(e) => setFiatBankId(e.target.value)}
                      placeholder="uuid from Mint bank account"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--text-secondary)]">Amount (USD)</label>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      required
                      className={inputClass}
                      style={inputStyle}
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                    />
                  </div>
                </>
              )}

          <ComparisonStrip amountUsdc={Number(amount) || 0} />

              <button
                type="submit"
                disabled={txStatus.status === "pending" || eurcCrossChainBlocked}
                className="w-full py-2.5 rounded-xl text-sm tracking-wide text-white disabled:opacity-50"
                style={{ background: "var(--dot-pink)" }}
                data-testid="send-submit"
              >
            {txStatus.status === "pending"
                  ? "Sending…"
                  : fundingPath !== "A" && deliveryMode === "fiat"
                    ? "Withdraw to bank"
                    : "Send remittance"}
          </button>
          <TxStatusBadge status={txStatus} />
            </form>
          )}

          {(step === "track" || remittanceId) && (
            <section
              className="rounded-2xl border p-6 flex flex-col gap-4"
              style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
            >
            <SettlementTracker
                remittanceId={remittanceId ?? undefined}
                legs={legs}
                onPayoutComplete={() => setSettled(true)}
              />
              <TxStatusBadge status={txStatus} />
              {fundingPath === "B_MOCK" && aedSettledDisplay && bankMockMeta && (
                <div
                  className="rounded-2xl border border-black/[0.07] bg-white p-4 flex flex-col gap-1"
                  data-testid="bank-mock-aed-settled"
                >
                  <div className="flex items-center gap-2 text-sm text-[#111]">
                    <img
                      src="/images/dhiram.png"
                      alt="Dirham"
                      width={32}
                      height={32}
                      className="rounded-full"
                    />
                    <span className="font-light tracking-tight">
                      {aedSettledDisplay} AED reached the recipient&apos;s bank account
                    </span>
                  </div>
                  <p className="text-xs text-black/45 pl-10" data-testid="bank-mock-recipient-bank">
                    {bankMockMeta.recipientBank.bankName}
                    {" · "}
                    {bankMockMeta.recipientBank.accountOrIban}
                    {bankMockMeta.recipientBank.swift
                      ? ` · SWIFT ${bankMockMeta.recipientBank.swift}`
                      : ""}
                  </p>
                </div>
              )}
              {settled && remittanceId && <ReceiptDownload remittanceId={remittanceId} />}
            </section>
          )}
        </>
      )}
    </div>
  );
}
