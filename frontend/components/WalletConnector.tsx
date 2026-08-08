"use client";

import { useAccount, useConnect, useDisconnect, useChainId, useSwitchChain } from "wagmi";
import { useState } from "react";
import { CHAIN_ID } from "@/lib/contracts/addresses";

export function WalletConnector() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending: isConnecting } = useConnect();
  const { disconnect }   = useDisconnect();
  const chainId          = useChainId();
  const { switchChain }  = useSwitchChain();
  const [showMenu, setShowMenu] = useState(false);

  const isWrongChain = isConnected && chainId !== CHAIN_ID;
  const short = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "";

  if (isWrongChain) {
    return (
      <button
        onClick={() => switchChain({ chainId: CHAIN_ID })}
        className="px-4 py-2 rounded-xl text-[11px] tracking-wide font-medium"
        style={{ background: "var(--warning)", color: "#fff" }}
      >
        Switch to Arc Testnet
      </button>
    );
  }

  if (isConnected && address) {
    return (
      <div className="relative">
        <button
          onClick={() => setShowMenu(v => !v)}
          className="flex items-center gap-2 px-3 py-2 rounded-xl border text-[11px] tracking-wide transition-colors hover:border-black/20"
          style={{ borderColor: "var(--border)", background: "var(--bg-card)", color: "var(--text-primary)" }}
        >
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: "var(--success)" }}
            aria-label="Connected"
          />
          <span className="font-mono text-[11px]">{short}</span>
        </button>
        {showMenu && (
          <div
            className="absolute right-0 top-full mt-2 w-48 rounded-2xl border p-2 z-50"
            style={{
              background: "rgba(255,255,255,0.95)",
              borderColor: "var(--border)",
              backdropFilter: "blur(16px)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.08)",
            }}
          >
            <p className="text-[10px] tracking-widest uppercase text-black/30 px-3 py-2">
              Arc Testnet
            </p>
            <button
              onClick={() => { disconnect(); setShowMenu(false); }}
              className="w-full text-left px-3 py-2 rounded-xl text-sm hover:bg-black/[0.04] text-[var(--error)]"
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(v => !v)}
        disabled={isConnecting}
        className="px-4 py-2 rounded-xl text-[11px] tracking-wide font-medium text-white disabled:opacity-50 transition-colors hover:bg-[#333]"
        style={{ background: "#111" }}
      >
        {isConnecting ? "Connecting…" : "Connect Wallet"}
      </button>
      {showMenu && (
        <div
          className="absolute right-0 top-full mt-2 w-52 rounded-2xl border p-2 z-50"
          style={{
            background: "rgba(255,255,255,0.95)",
            borderColor: "var(--border)",
            backdropFilter: "blur(16px)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.08)",
          }}
        >
          <p className="text-[10px] tracking-widest uppercase text-black/30 px-3 py-2">Select wallet</p>
          {connectors.map(connector => (
            <button
              key={connector.id}
              onClick={() => {
                connect({ connector, chainId: CHAIN_ID });
                setShowMenu(false);
              }}
              className="w-full text-left px-3 py-2 rounded-xl text-sm hover:bg-black/[0.04] text-[var(--text-primary)]"
            >
              {connector.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
