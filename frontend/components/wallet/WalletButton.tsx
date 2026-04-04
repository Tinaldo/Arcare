"use client";

import type { CircleWalletState } from "./useCircleWallet";

interface Props {
  walletState: CircleWalletState;
}

function truncate(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function WalletButton({ walletState }: Props) {
  const { isConnected, wallet, usdcBalance, openModal, disconnect } = walletState;

  if (!isConnected) {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={() => openModal("signin")}
          className="rounded-xl border border-arc-border px-5 py-2 text-sm font-semibold text-slate-600 hover:border-arc-blue hover:text-arc-blue transition-colors"
        >
          Sign In
        </button>
        <button
          onClick={() => openModal("signup")}
          className="arc-btn-primary px-5 py-2 text-sm"
        >
          Sign Up
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      {usdcBalance !== null && (
        <span className="text-sm font-medium text-slate-600">
          {parseFloat(usdcBalance).toFixed(2)} USDC
        </span>
      )}
      <div className="flex items-center gap-2 rounded-xl border border-arc-border bg-arc-card px-4 py-2">
        <span className="h-2 w-2 rounded-full bg-yes-green" />
        <span className="font-mono text-sm text-slate-800">
          {wallet ? truncate(wallet.address) : "…"}
        </span>
        <button
          onClick={disconnect}
          className="ml-1 text-xs text-slate-400 hover:text-slate-700"
          title="Disconnect"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
