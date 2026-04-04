"use client";

import { useState } from "react";
import { Spinner } from "@/components/ui/Spinner";
import { approveUsdcChallenge, addLiquidityChallenge } from "@/lib/circle-api";
import { parseUsdc } from "@/lib/arc-client";
import type { CircleWalletState } from "@/components/wallet/useCircleWallet";

interface Props {
  marketAddress: string;
  walletState: CircleWalletState;
  onComplete?: () => void;
}

export function LiquidityPanel({ marketAddress, walletState, onComplete }: Props) {
  const { isConnected, wallet, userToken, openModal, executeChallenge } = walletState;
  const [amount, setAmount] = useState("");
  const [txStep, setTxStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const handleAdd = async () => {
    if (!isConnected || !wallet || !userToken) { openModal(); return; }
    const amtBig = parseUsdc(amount);
    if (amtBig === 0n) { setError("Enter an amount"); return; }
    setError(null);

    try {
      setTxStep("Step 1 of 2: Approve USDC…");
      const appCh = await approveUsdcChallenge(userToken, wallet.id, marketAddress, amtBig.toString());
      await executeChallenge(appCh.challengeId);

      setTxStep("Step 2 of 2: Add liquidity…");
      const liqCh = await addLiquidityChallenge(userToken, wallet.id, marketAddress, amtBig.toString());
      await executeChallenge(liqCh.challengeId);

      setAmount("");
      setTxStep(null);
      onComplete?.();
    } catch (e: unknown) {
      setError((e as Error).message ?? "Transaction failed");
      setTxStep(null);
    }
  };

  return (
    <div className="rounded-2xl border border-arc-border bg-arc-card">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-5 py-4 text-sm font-medium text-gray-300 hover:text-white"
      >
        <span>Add Liquidity</span>
        <span className="text-xs text-gray-600">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="border-t border-arc-border px-5 pb-5 pt-4 space-y-3">
          <p className="text-xs text-gray-500">
            Provide USDC to earn trading fees. LP shares are redeemable proportionally.
          </p>
          <div className="flex items-center gap-2 rounded-xl border border-arc-border bg-black/30 px-4 py-3">
            <input
              type="number"
              min="0"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="flex-1 bg-transparent text-lg font-medium text-white outline-none placeholder:text-gray-600"
            />
            <span className="text-sm text-gray-500">USDC</span>
          </div>
          <button
            onClick={handleAdd}
            disabled={!!txStep}
            className="arc-btn-primary flex w-full items-center justify-center gap-2 py-2.5 text-sm disabled:opacity-60"
          >
            {txStep ? <><Spinner size={14} /> {txStep}</> : "Add Liquidity"}
          </button>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
      )}
    </div>
  );
}
