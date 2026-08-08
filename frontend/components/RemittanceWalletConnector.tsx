"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { remitDebug, remitDebugFetch } from "@/lib/remit-debug";

export interface RemittanceWallet {
  userId:         string;
  userToken:      string;
  encryptionKey:  string;
  walletId:       string;
  address:        string;
}

interface LoginResult {
  userToken:     string;
  encryptionKey: string;
}

interface OtpTokens {
  deviceToken:         string;
  deviceEncryptionKey: string;
  otpToken:            string;
}

interface Props {
  onReady?: (wallet: RemittanceWallet) => void;
}

const CIRCLE_APP_ID = process.env.NEXT_PUBLIC_CIRCLE_APP_ID ?? "";
/** Circle OTP UI can take a while; if the callback never fires, unblock the UI. */
const OTP_VERIFY_TIMEOUT_MS = 120_000;

export function RemittanceWalletConnector({ onReady }: Props) {
  const sdkRef = useRef<import("@circle-fin/w3s-pw-web-sdk").W3SSdk | null>(null);
  const onReadyRef = useRef(onReady);
  const otpTokensRef = useRef<OtpTokens | null>(null);
  const verifyPendingRef = useRef(false);
  const verifyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  onReadyRef.current = onReady;

  const [email,     setEmail]     = useState("");
  const [deviceId,  setDeviceId]  = useState("");
  const [otpTokens, setOtpTokens] = useState<OtpTokens | null>(null);
  const [wallet,    setWallet]    = useState<RemittanceWallet | null>(null);
  const [step,      setStep]      = useState<"email" | "otp" | "ready">("email");
  const [phase,     setPhase]     = useState<
    "idle" | "sending" | "verifying" | "initializing" | "creating"
  >("idle");
  const [status, setStatus] = useState("");
  const [error,  setError]  = useState("");

  const clearVerifyTimer = useCallback(() => {
    if (verifyTimerRef.current) {
      clearTimeout(verifyTimerRef.current);
      verifyTimerRef.current = null;
    }
  }, []);

  const finishWithWallets = useCallback(async (session: LoginResult) => {
    remitDebug("wallet.list.start");
    const listRes = await remitDebugFetch("wallet.list", "/api/circle/user/wallets", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ userToken: session.userToken }),
    });
    const listData = await listRes.json();
    if (!listRes.ok) throw new Error(listData.error ?? "Failed to load wallets");

    const first = listData.wallets?.[0] as { id?: string; address?: string; walletId?: string } | undefined;
    const walletId = first?.id ?? first?.walletId;
    if (!walletId || !first?.address) {
      throw new Error("No wallet found after setup");
    }

    const w: RemittanceWallet = {
      userId:        listData.userId,
      userToken:     session.userToken,
      encryptionKey: session.encryptionKey,
      walletId,
      address:       first.address,
    };
    setWallet(w);
    setStep("ready");
    setPhase("idle");
    setStatus("Wallet ready");
    remitDebug("wallet.ready", {
      userId:    w.userId,
      walletId:  w.walletId,
      address:   w.address,
      userToken: w.userToken,
    });
    onReadyRef.current?.(w);
  }, []);

  const runInitializeAndCreate = useCallback(async (session: LoginResult) => {
    setPhase("initializing");
    setStatus("Initializing wallet…");
    remitDebug("wallet.initialize.start", { userToken: session.userToken });
    const initRes = await remitDebugFetch("wallet.initialize", "/api/circle/user/initialize", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ userToken: session.userToken }),
    });
    const initData = await initRes.json();

    if (initData.alreadyHasWallets || initData.code === 155106) {
      remitDebug("wallet.initialize.skip", { reason: "already_has_wallets" });
      await finishWithWallets(session);
      return;
    }

    if (!initRes.ok) {
      throw new Error(initData.error ?? "Initialize failed");
    }

    const challengeId = initData.challengeId as string;
    if (!challengeId) throw new Error("Missing challengeId from initialize");

    const sdk = sdkRef.current;
    if (!sdk) throw new Error("Web SDK not ready — refresh and try again");

    sdk.setAuthentication({
      userToken:     session.userToken,
      encryptionKey: session.encryptionKey,
    });

    setPhase("creating");
    setStatus("Approve wallet creation in the Circle popup…");
    remitDebug("wallet.execute.start", { challengeId });
    await new Promise<void>((resolve, reject) => {
      sdk.execute(challengeId, (err) => {
        if (err) {
          remitDebug("wallet.execute.error", {
            message: (err as Error).message ?? String(err),
          });
          reject(err);
        } else {
          remitDebug("wallet.execute.done");
          resolve();
        }
      });
    });

    await new Promise((r) => setTimeout(r, 3000));
    await finishWithWallets(session);
  }, [finishWithWallets]);

  const runInitializeRef = useRef(runInitializeAndCreate);
  runInitializeRef.current = runInitializeAndCreate;

  // Init SDK once. React Strict Mode remounts effects — never keep a cancelled instance in sdkRef.
  useEffect(() => {
    if (!CIRCLE_APP_ID) return;

    let active = true;
    let localSdk: import("@circle-fin/w3s-pw-web-sdk").W3SSdk | null = null;

    (async () => {
      try {
        const { W3SSdk } = await import("@circle-fin/w3s-pw-web-sdk");
        if (!active) return;

        const onLoginComplete = (err: unknown, result?: unknown) => {
          if (!active) return;

          clearVerifyTimer();
          verifyPendingRef.current = false;

          if (err) {
            remitDebug("auth.otp.verify.error", {
              message: (err as Error).message ?? String(err),
            });
            setError((err as Error).message ?? "OTP verification failed");
            setPhase("idle");
            setStatus("OTP verification cancelled or failed — try again");
            return;
          }

          const login = result as LoginResult;
          if (!login?.userToken || !login?.encryptionKey) {
            setError("OTP verification returned an incomplete session");
            setPhase("idle");
            return;
          }

          remitDebug("auth.otp.verify.success", {
            userToken: login.userToken,
            encryptionKey: login.encryptionKey,
          });
          setStatus("Email verified — creating wallet…");
          runInitializeRef.current(login).catch((e: Error) => {
            setError(e.message ?? String(e));
            setPhase("idle");
            setStatus("Wallet setup failed — verify OTP again or use a different email");
          });
        };

        const sdk = new W3SSdk(
          { appSettings: { appId: CIRCLE_APP_ID } },
          onLoginComplete
        );
        if (!active) return;

        localSdk = sdk;
        sdkRef.current = sdk;

        const stored = localStorage.getItem("arcittance_device_id");
        const id = stored ?? (await sdk.getDeviceId());
        if (!active) return;

        if (!stored) localStorage.setItem("arcittance_device_id", id);
        setDeviceId(id);
        remitDebug("auth.sdk.ready", {
          appId: CIRCLE_APP_ID,
          deviceId: id,
        });
      } catch (e: unknown) {
        if (!active) return;
        const message = e instanceof Error ? e.message : String(e);
        remitDebug("auth.sdk.error", { message });
        setError(message || "Failed to load Circle Web SDK");
      }
    })();

    return () => {
      active = false;
      clearVerifyTimer();
      // Only clear if this effect still owns sdkRef (avoid wiping a newer Strict Mode instance).
      if (sdkRef.current === localSdk) {
        sdkRef.current = null;
      }
    };
  }, [clearVerifyTimer]);

  async function handleRequestOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!CIRCLE_APP_ID) {
      setError("NEXT_PUBLIC_CIRCLE_APP_ID is not set — get App ID from Circle Console → Wallets → User Controlled → Configurator");
      return;
    }
    if (!deviceId || !sdkRef.current) {
      setError("Web SDK still initializing — wait a moment and retry");
      return;
    }

    setPhase("sending");
    setError("");
    setStatus("Sending OTP…");
    try {
      remitDebug("auth.otp.request.start", { email, deviceId });
      const res = await remitDebugFetch("auth.otp.request", "/api/circle/user/request-otp", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email, deviceId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to send OTP");

      const tokens: OtpTokens = {
        deviceToken:         data.deviceToken,
        deviceEncryptionKey: data.deviceEncryptionKey,
        otpToken:            data.otpToken,
      };
      otpTokensRef.current = tokens;
      setOtpTokens(tokens);
      sdkRef.current.updateConfigs({
        appSettings:  { appId: CIRCLE_APP_ID },
        loginConfigs: tokens,
      });
      setStep("otp");
      setStatus("OTP sent — check your email");
      remitDebug("auth.otp.request.success", { email });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      remitDebug("auth.otp.request.error", { message });
      setError(message);
    } finally {
      setPhase("idle");
    }
  }

  function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    const tokens = otpTokensRef.current ?? otpTokens;
    const sdk = sdkRef.current;
    if (!sdk || !tokens) {
      setError("Request OTP first");
      return;
    }

    // Re-apply tokens in case Strict Mode replaced the SDK after Send OTP.
    sdk.updateConfigs({
      appSettings:  { appId: CIRCLE_APP_ID },
      loginConfigs: tokens,
    });

    clearVerifyTimer();
    verifyPendingRef.current = true;
    setPhase("verifying");
    setError("");
    setStatus("Opening Circle OTP verification…");
    remitDebug("auth.otp.verify.start", { email });

    verifyTimerRef.current = setTimeout(() => {
      if (!verifyPendingRef.current) return;
      verifyPendingRef.current = false;
      setPhase("idle");
      setStatus("Verification timed out — click Verify again (or request a new OTP)");
      setError(
        "Circle did not finish OTP verification. Close any Circle popup, then try Verify again."
      );
      remitDebug("auth.otp.verify.timeout", { email });
    }, OTP_VERIFY_TIMEOUT_MS);

    try {
      sdk.verifyOtp();
    } catch (err: unknown) {
      clearVerifyTimer();
      verifyPendingRef.current = false;
      setPhase("idle");
      const message = err instanceof Error ? err.message : String(err);
      setError(message || "Failed to open OTP verification");
    }
  }

  function handleResetEmail() {
    clearVerifyTimer();
    verifyPendingRef.current = false;
    otpTokensRef.current = null;
    setOtpTokens(null);
    setStep("email");
    setPhase("idle");
    setError("");
    setStatus("");
  }

  const busy = phase !== "idle";
  const verifyLabel =
    phase === "verifying"     ? "Verifying…"
    : phase === "initializing" ? "Setting up wallet…"
    : phase === "creating"     ? "Approve Circle popup…"
    : "Verify OTP & Create Wallet";

  if (!CIRCLE_APP_ID) {
    return (
      <div className="rounded-2xl border border-black/[0.07] bg-white p-4 text-sm">
        <p className="text-[11px] tracking-widest uppercase text-black/40 mb-2">Circle App ID required</p>
        <p className="text-black/50">
          Set <code>NEXT_PUBLIC_CIRCLE_APP_ID</code> in <code>frontend/.env.local</code> from
          Circle Console → Wallets → User Controlled → Configurator.
        </p>
      </div>
    );
  }

  if (step === "ready" && wallet) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl border text-[11px] tracking-wide"
             style={{ borderColor: "var(--border)", background: "var(--bg-card)", color: "var(--text-primary)" }}>
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--success)" }} />
          <span className="font-mono text-[11px]">{wallet.address.slice(0, 8)}…{wallet.address.slice(-4)}</span>
          <span className="text-[11px] tracking-widest uppercase text-black/40">Circle Wallet</span>
        </div>
        {process.env.NODE_ENV === "development" && (
          <details className="rounded-2xl border border-black/[0.07] bg-white p-3 text-xs">
            <summary className="cursor-pointer text-[11px] tracking-widest uppercase text-black/40">CLI test credentials (dev)</summary>
            <pre className="mt-2 p-2 rounded-xl overflow-x-auto text-[10px] border border-black/[0.07] bg-white">
{`REMIT_TEST_USER_ID=${wallet.userId}
REMIT_TEST_WALLET_ID=${wallet.walletId}
REMIT_TEST_WALLET_ADDRESS=${wallet.address}`}
            </pre>
          </details>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-black/[0.07] bg-white p-4">
      <p className="text-[11px] tracking-widest uppercase text-black/40 mb-1">Sign in with Circle Wallet</p>
      {status && <p className="text-xs text-black/40 mb-3">{status}</p>}

      {step === "email" ? (
        <form onSubmit={handleRequestOtp} className="flex flex-col gap-2">
          <input type="email" required placeholder="you@example.com" value={email}
                 onChange={(e) => setEmail(e.target.value)}
                 className="rounded-xl border border-black/[0.07] bg-white px-3 py-2 text-sm" />
          <button type="submit" disabled={busy || !deviceId}
                  className="px-4 py-2 rounded-xl text-sm tracking-wide font-medium text-white disabled:opacity-50 transition-colors hover:bg-[#333]"
                  style={{ background: "#111" }}>
            {phase === "sending" ? "Sending OTP…" : "Send OTP"}
          </button>
        </form>
      ) : (
        <form onSubmit={handleVerifyOtp} className="flex flex-col gap-2">
          <p className="text-xs text-black/40">
            Check <strong>{email}</strong> for the code, then verify below.
          </p>
          <button type="submit" disabled={busy}
                  className="px-4 py-2 rounded-xl text-sm tracking-wide font-medium text-white disabled:opacity-50 transition-colors hover:bg-[#333]"
                  style={{ background: "#111" }}>
            {verifyLabel}
          </button>
          <button type="button"
                  className="px-4 py-2 rounded-xl border border-black/[0.07] text-sm tracking-wide text-black/50 hover:border-black/20 transition-colors"
                  onClick={handleResetEmail}>
            Use a different email
          </button>
        </form>
      )}

      {error && <p className="text-xs mt-2" style={{ color: "var(--error)" }}>{error}</p>}
    </div>
  );
}
