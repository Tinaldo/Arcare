"use client";

import { useState } from "react";
import { Spinner } from "@/components/ui/Spinner";
import { parseUsdc } from "@/lib/arc-client";
import { PREDICTION_MARKET_ABI } from "@/lib/abis";
import { ARC_USDC_ADDRESS } from "@/lib/addresses";
import { useContract, ERC20_ABI } from "@/lib/use-contract";
import type { WalletState } from "@/components/wallet/useWallet";

interface Props {
  marketAddress: string;
  walletState: WalletState;
  onComplete?: () => void;
}

export function LiquidityPanel({ marketAddress, walletState, onComplete }: Props) {
  const { isConnected, connect } = walletState;
  const market = useContract(marketAddress as `0x${string}`, PREDICTION_MARKET_ABI);
  const usdc = useContract(ARC_USDC_ADDRESS, ERC20_ABI);

  const [amount, setAmount] = useState("");
  const [txStep, setTxStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const handleAdd = async () => {
    if (!isConnected) { connect(); return; }
    const amtBig = parseUsdc(amount);
    if (amtBig === 0n) { setError("Enter an amount"); return; }
    setError(null);

    try {
      setTxStep("Step 1 of 2: Approve USDC…");
      await usdc.write("approve", [marketAddress, amtBig]);
      setTxStep("Step 2 of 2: Add liquidity…");
      await market.write("addLiquidity", [amtBig]);
      setAmount("");
      setTxStep(null);
      onComplete?.();
    } catch (e: unknown) {
      setError((e as Error).message ?? "Transaction failed");
      setTxStep(null);
    }
  };

  return (
    <div className="glass-card overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-5 py-4 text-sm font-semibold text-slate-700 hover:text-[#745BFF] transition-colors"
      >
        <span className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-[#745BFF]">water_drop</span>
          Add Liquidity
        </span>
        <span className="material-symbols-outlined text-[16px] text-slate-400">
          {open ? "expand_less" : "expand_more"}
        </span>
      </button>

      {open && (
        <div className="border-t border-[rgba(116,91,255,0.12)] px-5 pb-5 pt-4 space-y-3">
          <p className="text-xs text-slate-500">
            Provide USDC to earn trading fees. LP shares are redeemable proportionally.
          </p>
          <div className="flex items-center gap-2 rounded-xl border border-[rgba(116,91,255,0.2)] bg-white/80 px-4 py-3">
            <input
              type="number"
              min="0"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="flex-1 bg-transparent text-lg font-bold text-slate-800 outline-none placeholder:text-slate-300 placeholder:font-normal"
            />
            <span className="text-sm font-semibold text-slate-400">USDC</span>
          </div>
          <button
            onClick={handleAdd}
            disabled={!!txStep}
            className="arc-btn-primary w-full py-2.5 text-sm disabled:opacity-60"
          >
            {txStep ? (
              <span className="flex items-center justify-center gap-2">
                <Spinner size={14} /> {txStep}
              </span>
            ) : (
              "Add Liquidity"
            )}
          </button>
          {error && (
            <p className="rounded-xl bg-red-500/8 border border-red-500/20 px-3 py-2 text-sm text-red-500">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
