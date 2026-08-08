"use client";

import { useCallback, useEffect, useState } from "react";
import { isAddress } from "viem";
import {
  BANK_MOCK_PAYOUT_CHAINS,
  PAYOUT_CHAIN_LABELS,
  isBankMockPayoutChain,
  type BankMockPayoutChain,
} from "@/lib/circle/supported-chains";

export interface MockBankDetails {
  bankName: string;
  accountOrIban: string;
  swift: string;
}

export interface BankMockFundedInfo {
  ledgerId: string;
  availableLedgerUsdc: string;
  usdcAmount: string;
  aedAmount: string;
  rate: number;
  usdToAed: number;
  recipientAddress: string;
  chain: BankMockPayoutChain;
  recipientBank: MockBankDetails;
}

interface Props {
  userId: string;
  onFunded?: (info: BankMockFundedInfo) => void;
}

const emptyBank = (): MockBankDetails => ({
  bankName: "",
  accountOrIban: "",
  swift: "",
});

export function BankMockFundPanel({ userId, onFunded }: Props) {
  const [senderBank, setSenderBank] = useState<MockBankDetails>(emptyBank);
  const [recipientBank, setRecipientBank] = useState<MockBankDetails>(emptyBank);
  const [recipientAddress, setRecipientAddress] = useState("");
  const [chain, setChain] = useState<BankMockPayoutChain>("ARC");
  const [aedAmount, setAedAmount] = useState("100");
  const [rate, setRate] = useState<number | null>(null);
  const [usdToAed, setUsdToAed] = useState<number | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  const usdcEstimate =
    rate != null && Number(aedAmount) > 0
      ? (Number(aedAmount) * rate).toFixed(2)
      : null;

  const refreshQuote = useCallback(async () => {
    setQuoteError(null);
    try {
      const res = await fetch("/api/remit/bank-mock/quote");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Quote failed");
      setRate(Number(data.aedToUsd));
      setUsdToAed(Number(data.usdToAed));
    } catch (err: unknown) {
      setQuoteError(err instanceof Error ? err.message : String(err));
      setRate(null);
      setUsdToAed(null);
    }
  }, []);

  useEffect(() => {
    void refreshQuote();
    const id = setInterval(() => void refreshQuote(), 55_000);
    return () => clearInterval(id);
  }, [refreshQuote]);

  async function runFund(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (!isAddress(recipientAddress)) {
        throw new Error("Enter a valid recipient 0x address");
      }
      if (!senderBank.bankName || !senderBank.accountOrIban) {
        throw new Error("Sender bank name and account/IBAN required (demo)");
      }
      if (!recipientBank.bankName || !recipientBank.accountOrIban) {
        throw new Error("Recipient bank name and account/IBAN required (demo)");
      }

      const res = await fetch("/api/remit/bank-mock/fund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          aedAmount,
          senderBank,
          recipientBank,
          recipientAddress,
          chain,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Bank-mock fund failed");
      setResult(data);
      onFunded?.({
        ledgerId: String(data.ledgerId),
        availableLedgerUsdc: String(data.availableLedgerUsdc ?? data.usdcAmount),
        usdcAmount: String(data.usdcAmount),
        aedAmount: String(data.aedAmount),
        rate: Number(data.rate),
        usdToAed: Number(data.usdToAed),
        recipientAddress: String(data.recipientAddress),
        chain: isBankMockPayoutChain(String(data.chain))
          ? (String(data.chain).toUpperCase() as BankMockPayoutChain)
          : chain,
        recipientBank: { ...recipientBank },
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "w-full mt-1 rounded-xl border border-black/[0.07] bg-white px-3 py-2 text-sm text-[#111]";

  function BankFields({
    title,
    value,
    onChange,
    testIdPrefix,
  }: {
    title: string;
    value: MockBankDetails;
    onChange: (v: MockBankDetails) => void;
    testIdPrefix: string;
  }) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-[11px] tracking-widest uppercase text-black/40">{title}</p>
        <input
          className={inputClass}
          placeholder="Bank name"
          data-testid={`${testIdPrefix}-bank-name`}
          value={value.bankName}
          onChange={(e) => onChange({ ...value, bankName: e.target.value })}
          disabled={loading}
          required
        />
        <input
          className={inputClass}
          placeholder="IBAN / account number"
          data-testid={`${testIdPrefix}-iban`}
          value={value.accountOrIban}
          onChange={(e) => onChange({ ...value, accountOrIban: e.target.value })}
          disabled={loading}
          required
        />
        <input
          className={inputClass}
          placeholder="SWIFT (optional)"
          data-testid={`${testIdPrefix}-swift`}
          value={value.swift}
          onChange={(e) => onChange({ ...value, swift: e.target.value })}
          disabled={loading}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid="bank-mock-fund-panel">
      <div>
        <h2 className="text-sm font-light tracking-tight text-[#111] flex items-center gap-2">
          <img
            src="/images/dhiram.png"
            alt=""
            width={28}
            height={28}
            className="rounded-full"
          />
          Fund via AED bank
        </h2>
        <p className="text-xs text-black/45 mt-1">
          Enter bank details, AED amount, and the recipient address. Funds settle to their bank
          account on the chosen network.
        </p>
      </div>

      <form onSubmit={runFund} className="flex flex-col gap-4">
        <BankFields
          title="Your bank (sender)"
          value={senderBank}
          onChange={setSenderBank}
          testIdPrefix="mock-sender"
        />
        <BankFields
          title="Recipient bank"
          value={recipientBank}
          onChange={setRecipientBank}
          testIdPrefix="mock-recipient"
        />

        <div>
          <label className="text-[11px] tracking-widest uppercase text-black/40 flex items-center gap-1.5">
            <img src="/images/dhiram.png" alt="" width={16} height={16} className="rounded-full" />
            Amount (AED)
          </label>
          <input
            type="number"
            min="1"
            step="0.01"
            required
            data-testid="bank-mock-aed-amount"
            className={inputClass}
            value={aedAmount}
            onChange={(e) => setAedAmount(e.target.value)}
            disabled={loading}
          />
          {usdcEstimate != null && (
            <p className="text-xs text-black/45 mt-1" data-testid="bank-mock-usdc-estimate">
              ≈ {usdcEstimate} USDC
              {usdToAed != null ? ` · 1 USDC ≈ ${usdToAed.toFixed(4)} AED` : ""}
            </p>
          )}
          {quoteError && (
            <p className="text-xs mt-1" style={{ color: "var(--error)" }}>
              Rate: {quoteError}
            </p>
          )}
        </div>

        <div>
          <label className="text-[11px] tracking-widest uppercase text-black/40">
            Recipient blockchain address
          </label>
          <input
            className={`${inputClass} font-mono`}
            placeholder="0x…"
            data-testid="bank-mock-recipient-address"
            value={recipientAddress}
            onChange={(e) => setRecipientAddress(e.target.value)}
            disabled={loading}
            required
          />
        </div>

        <div>
          <label className="text-[11px] tracking-widest uppercase text-black/40">
            Destination chain
          </label>
          <select
            className={inputClass}
            data-testid="bank-mock-chain"
            value={chain}
            onChange={(e) => setChain(e.target.value as BankMockPayoutChain)}
            disabled={loading}
          >
            {BANK_MOCK_PAYOUT_CHAINS.map((c) => (
              <option key={c} value={c}>
                {PAYOUT_CHAIN_LABELS[c] ?? c}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          disabled={loading || rate == null}
          data-testid="bank-mock-fund-submit"
          className="w-full py-2.5 rounded-xl text-sm tracking-wide font-medium text-white disabled:opacity-50"
          style={{ background: "#111" }}
        >
          {loading ? "Funding Mint & paying out…" : "Send to recipient"}
        </button>
      </form>

      {error && (
        <p className="text-xs" style={{ color: "var(--error)" }} data-testid="bank-mock-fund-error">
          {error}
        </p>
      )}

      {result && (
        <div
          className="rounded-2xl border border-black/[0.07] bg-white p-3 text-xs flex flex-col gap-1"
          data-testid="bank-mock-fund-result"
        >
          <div className="flex justify-between">
            <span className="text-black/45">Status</span>
            <span className="text-[#111]">{String(result.status)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-black/45 flex items-center gap-1">
              <img src="/images/dhiram.png" alt="" width={14} height={14} />
              AED in
            </span>
            <span>{String(result.aedAmount)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-black/45">USDC credited</span>
            <span>{String(result.usdcAmount)}</span>
          </div>
          {result.treasuryTxHash != null && (
            <div className="flex justify-between">
              <span className="text-black/45">Treasury tx</span>
              <span className="font-mono">{String(result.treasuryTxHash).slice(0, 12)}…</span>
            </div>
          )}
          {result.warning != null && (
            <p className="mt-1" style={{ color: "var(--warning)" }}>
              {String(result.warning)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
