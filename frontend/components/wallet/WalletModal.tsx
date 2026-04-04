"use client";

import { useState, useEffect } from "react";
import type { CircleWalletState } from "./useCircleWallet";
import { listWallets } from "@/lib/circle-api";

const STORAGE_KEY = "insurarc_userId";

type SignInStep = "idle" | "loading" | "done";
type SignUpStep = "userId" | "token" | "pin_setup" | "creating" | "done";

interface Props {
  walletState: CircleWalletState;
}

export function WalletModal({ walletState }: Props) {
  const {
    sdkReady, showModal, closeModal, modalMode,
    handleCreateUser, handleGetToken, handleInitialize, handleConnected,
    executeChallenge, userToken, encryptionKey,
  } = walletState;

  const [tab, setTab] = useState<"signin" | "signup">("signin");

  // Sign-in state
  const [siUserId, setSiUserId] = useState("");
  const [siStep, setSiStep] = useState<SignInStep>("idle");
  const [siError, setSiError] = useState("");

  // Sign-up state
  const [suUserId, setSuUserId] = useState("");
  const [suStep, setSuStep] = useState<SignUpStep>("userId");
  const [suStatus, setSuStatus] = useState("");
  const [suError, setSuError] = useState("");
  const [suLoading, setSuLoading] = useState(false);

  // On open: set tab from modalMode and pre-fill sign-in userId from storage
  useEffect(() => {
    if (!showModal) return;
    setTab(modalMode);
    setSiError("");
    setSuError("");
    setSuStatus("");
    setSiStep("idle");
    setSuStep("userId");
    setSuLoading(false);
    const saved = localStorage.getItem(STORAGE_KEY);
    setSiUserId(saved ?? "");
  }, [showModal, modalMode]);

  if (!showModal) return null;

  // ── SIGN IN ────────────────────────────────────────────────────────────────
  // Flow: userId → getToken → listWallets → connect
  // No PIN challenge at login — PIN is required per-transaction (Circle architecture)

  const onSignIn = async () => {
    if (siUserId.length < 5) { setSiError("User ID must be at least 5 characters"); return; }
    setSiError("");
    setSiStep("loading");

    try {
      const tokenResult = await handleGetToken(siUserId);
      if (tokenResult.error || !tokenResult.userToken) {
        setSiError(tokenResult.error ?? "User not found. Check your User ID.");
        setSiStep("idle");
        return;
      }

      const wallets = await listWallets(tokenResult.userToken);
      const arc = wallets.find((w) => w.blockchain === "ARC-TESTNET") ?? wallets[0];

      if (!arc) {
        setSiError("No wallet found for this account. Sign up first.");
        setSiStep("idle");
        return;
      }

      localStorage.setItem(STORAGE_KEY, siUserId);
      handleConnected(arc, tokenResult.userToken, tokenResult.encryptionKey!);
      setSiStep("done");
    } catch (e: unknown) {
      setSiError((e as Error).message ?? "Sign in failed");
      setSiStep("idle");
    }
  };

  // ── SIGN UP ────────────────────────────────────────────────────────────────
  // Flow: choose userId → createUser → getToken → initializeUser → PIN setup challenge → done

  const onCreateUser = async () => {
    if (suUserId.length < 5) { setSuError("User ID must be at least 5 characters"); return; }
    setSuError("");
    setSuLoading(true);
    const { error } = await handleCreateUser(suUserId);
    setSuLoading(false);
    if (error) { setSuError(error); return; }
    setSuStep("token");
  };

  const onGetToken = async () => {
    setSuError("");
    setSuLoading(true);
    const { error } = await handleGetToken(suUserId);
    setSuLoading(false);
    if (error) { setSuError(error); return; }
    setSuStep("pin_setup");
  };

  const onSetupPin = async () => {
    if (!userToken) { setSuError("Session expired — go back"); return; }
    setSuError("");
    setSuLoading(true);
    setSuStatus("Opening PIN setup…");

    const result = await handleInitialize(userToken);
    setSuLoading(false);

    if (result.alreadyExists) {
      // Account already has a wallet — treat as sign-in
      localStorage.setItem(STORAGE_KEY, suUserId);
      setSuStep("done");
      return;
    }
    if (result.error) { setSuError(result.error); setSuStatus(""); return; }
    if (!result.challengeId) { setSuError("No challenge returned"); setSuStatus(""); return; }

    setSuStep("creating");
    setSuStatus("Complete the PIN setup in the Circle screen…");

    try {
      await executeChallenge(result.challengeId);

      const wallets = await listWallets(userToken!);
      const arc = wallets.find((w) => w.blockchain === "ARC-TESTNET") ?? wallets[0];

      if (arc) {
        localStorage.setItem(STORAGE_KEY, suUserId);
        handleConnected(arc, userToken!, encryptionKey!);
        setSuStep("done");
      } else {
        setSuStatus("Waiting for wallet to index…");
        await new Promise(r => setTimeout(r, 3000));
        const ws = await listWallets(userToken!);
        const w2 = ws.find((w) => w.blockchain === "ARC-TESTNET") ?? ws[0];
        if (w2) {
          localStorage.setItem(STORAGE_KEY, suUserId);
          handleConnected(w2, userToken!, encryptionKey!);
          setSuStep("done");
        }
      }
    } catch (e: unknown) {
      setSuError((e as Error).message ?? "PIN setup failed");
      setSuStatus("");
      setSuStep("pin_setup");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-arc-border bg-white p-8 shadow-2xl">

        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              {tab === "signin" ? "Sign In" : "Create Account"}
            </h2>
            <p className="mt-0.5 text-sm text-slate-400">Powered by Circle · Arc Testnet</p>
          </div>
          <button
            onClick={closeModal}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            ✕
          </button>
        </div>

        {/* Tabs — only show when not mid-flow */}
        {siStep !== "done" && suStep !== "done" && suStep !== "creating" && (
          <div className="mb-6 flex rounded-xl bg-slate-100 p-1">
            <button
              onClick={() => { setTab("signin"); setSiError(""); setSuError(""); }}
              className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${
                tab === "signin" ? "bg-arc-blue text-white" : "text-slate-400 hover:text-slate-700"
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => { setTab("signup"); setSiError(""); setSuError(""); }}
              className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${
                tab === "signup" ? "bg-arc-blue text-white" : "text-slate-400 hover:text-slate-700"
              }`}
            >
              Sign Up
            </button>
          </div>
        )}

        {/* ── SIGN IN PANEL ── */}
        {tab === "signin" && (
          <div className="space-y-4">
            {siStep === "done" ? (
              <div className="py-4 text-center text-green-400 space-y-2">
                <div className="text-3xl">✓</div>
                <p className="font-medium">Signed in!</p>
              </div>
            ) : (
              <>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    User ID
                  </label>
                  <input
                    className="arc-input"
                    placeholder="Your User ID"
                    value={siUserId}
                    onChange={(e) => setSiUserId(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && onSignIn()}
                    disabled={!sdkReady || siStep === "loading"}
                    autoFocus
                  />
                </div>

                <p className="text-xs text-slate-400">
                  Your PIN will be required to approve each transaction.
                </p>

                <button
                  className="arc-btn-primary w-full py-3"
                  onClick={onSignIn}
                  disabled={!sdkReady || siStep === "loading"}
                >
                  {siStep === "loading" ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Signing in…
                    </span>
                  ) : "Sign In"}
                </button>

                {siError && <p className="text-sm text-red-400">{siError}</p>}

                <p className="text-center text-xs text-slate-400">
                  No account?{" "}
                  <button
                    onClick={() => setTab("signup")}
                    className="text-arc-blue hover:underline"
                  >
                    Create one
                  </button>
                </p>
              </>
            )}
          </div>
        )}

        {/* ── SIGN UP PANEL ── */}
        {tab === "signup" && (
          <div className="space-y-4">

            {/* Step: choose userId */}
            {suStep === "userId" && (
              <>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Choose a User ID <span className="text-slate-400">(min 5 chars)</span>
                  </label>
                  <input
                    className="arc-input"
                    placeholder="e.g. alice_insurarc"
                    value={suUserId}
                    onChange={(e) => setSuUserId(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && onCreateUser()}
                    disabled={!sdkReady || suLoading}
                    autoFocus
                  />
                </div>
                <button
                  className="arc-btn-primary w-full py-3"
                  onClick={onCreateUser}
                  disabled={!sdkReady || suLoading}
                >
                  {suLoading ? "Creating account…" : "Create Account"}
                </button>
                {suError && <p className="text-sm text-red-400">{suError}</p>}
                <p className="text-center text-xs text-slate-400">
                  Already have an account?{" "}
                  <button onClick={() => setTab("signin")} className="text-arc-blue hover:underline">
                    Sign in
                  </button>
                </p>
              </>
            )}

            {/* Step: get session token */}
            {suStep === "token" && (
              <>
                <div className="rounded-xl border border-arc-border bg-slate-50 px-4 py-3">
                  <p className="text-xs text-slate-400">Account created</p>
                  <p className="font-mono font-semibold text-slate-800">{suUserId}</p>
                </div>
                <button
                  className="arc-btn-primary w-full py-3"
                  onClick={onGetToken}
                  disabled={suLoading}
                >
                  {suLoading ? "Continuing…" : "Continue"}
                </button>
                {suError && <p className="text-sm text-red-400">{suError}</p>}
              </>
            )}

            {/* Step: set up PIN */}
            {suStep === "pin_setup" && (
              <>
                <div className="rounded-xl border border-arc-border bg-slate-50 px-4 py-3 space-y-1">
                  <p className="text-xs text-slate-400">Setting up wallet for</p>
                  <p className="font-mono font-semibold text-slate-800">{suUserId}</p>
                </div>
                <p className="text-sm text-slate-600">
                  Circle will open a secure screen where you set your <strong className="text-slate-900">PIN</strong> and
                  security questions. This PIN protects every transaction.
                </p>
                <button
                  className="arc-btn-primary w-full py-3"
                  onClick={onSetupPin}
                  disabled={suLoading}
                >
                  {suLoading ? "Opening PIN setup…" : "Set Up PIN & Create Wallet"}
                </button>
                {suError && <p className="text-sm text-red-400">{suError}</p>}
              </>
            )}

            {/* Step: waiting for Circle PIN flow */}
            {suStep === "creating" && (
              <div className="py-4 text-center space-y-3">
                <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-arc-blue border-t-transparent" />
                <p className="text-sm text-slate-500">{suStatus}</p>
              </div>
            )}

            {/* Done */}
            {suStep === "done" && (
              <div className="py-4 text-center text-green-400 space-y-2">
                <div className="text-3xl">✓</div>
                <p className="font-medium">Wallet created!</p>
                <p className="text-xs text-slate-400">Your PIN is set — you&apos;ll use it to approve trades.</p>
              </div>
            )}
          </div>
        )}

        {!sdkReady && siStep !== "done" && suStep !== "done" && (
          <p className="mt-4 text-center text-xs text-slate-400">Initializing Circle SDK…</p>
        )}
      </div>
    </div>
  );
}
