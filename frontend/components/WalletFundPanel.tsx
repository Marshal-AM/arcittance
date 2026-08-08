"use client";

import { useCallback, useEffect, useState } from "react";

interface Props {
  userToken: string;
  walletId: string;
  address: string;
  refreshKey?: number;
}

export function WalletFundPanel({ userToken, walletId, address, refreshKey = 0 }: Props) {
  const [usdc, setUsdc] = useState<string>("—");
  const [eurc, setEurc] = useState<string>("—");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/remit/wallet/balance?userToken=${encodeURIComponent(userToken)}&walletId=${encodeURIComponent(walletId)}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load balance");
      setUsdc(data.usdc ?? "0");
      setEurc(data.eurc ?? "0");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [userToken, walletId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(address)}`;

  return (
    <div className="flex flex-col gap-4" data-testid="wallet-fund-panel">
      <div>
        <h2 className="text-sm font-light tracking-tight text-[#111]">Fund your wallet</h2>
        <p className="text-xs text-black/45 mt-1">
          This is your Circle embedded wallet on Arc. Send USDC here from another wallet or the Circle faucet.
        </p>
      </div>

      <div className="rounded-2xl border border-black/[0.07] bg-white p-4 flex flex-col gap-2">
        <span className="text-[11px] tracking-widest uppercase text-black/40">Wallet address</span>
        <code className="text-xs break-all font-mono text-[#111]" data-testid="wallet-address">
          {address}
        </code>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qrUrl} alt="Wallet QR" width={140} height={140} className="mx-auto rounded-xl" />
      </div>

      <div
        className="rounded-2xl border border-black/[0.07] bg-white p-4 flex flex-col gap-2"
        data-testid="wallet-balance"
      >
        <div className="flex justify-between items-center">
          <p className="text-[11px] tracking-widest uppercase text-black/40">
            Balance
          </p>
          <button
            type="button"
            onClick={() => void load()}
            className="text-xs underline text-black/45 hover:text-[#111] transition-colors"
          >
            Refresh
          </button>
        </div>
        {loading && <p className="text-sm animate-pulse text-black/45">Loading…</p>}
        {error && (
          <p className="text-xs" style={{ color: "var(--error)" }}>
            {error}
          </p>
        )}
        {!loading && (
          <>
            <div className="flex justify-between text-sm">
              <span className="text-black/45">USDC</span>
              <span className="font-light tracking-tight text-[#111]" data-testid="wallet-usdc">
                {usdc}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-black/45">EURC</span>
              <span className="font-light tracking-tight text-[#111]" data-testid="wallet-eurc">
                {eurc}
              </span>
            </div>
          </>
        )}
      </div>

      <p className="text-xs text-black/35">
        Faucet: faucet.circle.com → Arc Testnet → paste your wallet address.
      </p>
    </div>
  );
}
