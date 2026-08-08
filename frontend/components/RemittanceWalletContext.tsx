"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { RemittanceWallet } from "./RemittanceWalletConnector";

interface RemittanceWalletContextValue {
  wallet: RemittanceWallet | null;
  setWallet: (wallet: RemittanceWallet | null) => void;
}

const RemittanceWalletContext = createContext<RemittanceWalletContextValue>({
  wallet:    null,
  setWallet: () => {},
});

function readTestWallet(): RemittanceWallet | null {
  if (typeof window === "undefined") return null;
  const w = (window as unknown as { __ARCITTANCE_TEST_REMIT_WALLET__?: RemittanceWallet })
    .__ARCITTANCE_TEST_REMIT_WALLET__;
  if (!w?.userId || !w.address) return null;
  return w;
}

export function RemittanceWalletProvider({ children }: { children: React.ReactNode }) {
  const [wallet, setWallet] = useState<RemittanceWallet | null>(null);

  useEffect(() => {
    const injected = readTestWallet();
    if (injected) setWallet(injected);

    const onInject = () => {
      const next = readTestWallet();
      if (next) setWallet(next);
    };
    window.addEventListener("arcittance:test-remit-wallet", onInject);
    return () => window.removeEventListener("arcittance:test-remit-wallet", onInject);
  }, []);

  return (
    <RemittanceWalletContext.Provider value={{ wallet, setWallet }}>
      {children}
    </RemittanceWalletContext.Provider>
  );
}

export function useRemittanceWallet() {
  return useContext(RemittanceWalletContext);
}
