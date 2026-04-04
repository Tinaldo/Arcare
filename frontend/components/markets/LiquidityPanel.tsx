"use client";

import { useState, useEffect, useCallback } from "react";
import { Spinner } from "@/components/ui/Spinner";
import { parseUsdc, arcClient, formatUsdc } from "@/lib/arc-client";
import { PREDICTION_MARKET_ABI } from "@/lib/abis";
import { ARC_USDC_ADDRESS } from "@/lib/addresses";
import { useContract, ERC20_ABI } from "@/lib/use-contract";
import type { WalletState } from "@/components/wallet/useWallet";

interface Props {
  marketAddress: string;
  walletState: WalletState;
  resolved?: boolean;
  onComplete?: () => void;
}

export function LiquidityPanel({ marketAddress, walletState, resolved = false, onComplete }: Props) {
  const { isConnected, connect, address } = walletState;
  const market = useContract(marketAddress as `0x${string}`, PREDICTION_MARKET_ABI);
  const usdc = useContract(ARC_USDC_ADDRESS, ERC20_ABI);

  const [amount, setAmount] = useState("");
  const [txStep, setTxStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [lpShares, setLpShares] = useState<bigint>(0n);
  const [sharesLoaded, setSharesLoaded] = useState(false);

  const loadLpShares = useCallback(async () => {
    if (!address) return;
    try {
      const shares = await arcClient.readContract({
        address: marketAddress as `0x${string}`,
        abi: PREDICTION_MARKET_ABI,
        functionName: "lpShares",
        args: [address],
      });
      setLpShares(shares as bigint);
    } catch {
      setLpShares(0n);
    } finally {
      setSharesLoaded(true);
    }
  }, [address, marketAddress]);

  useEffect(() => {
    if (isConnected) void loadLpShares();
  }, [isConnected, loadLpShares]);

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
      await loadLpShares();
      onComplete?.();
    } catch (e: unknown) {
      setError((e as Error).message ?? "Transaction failed");
      setTxStep(null);
    }
  };

  const handleRemove = async () => {
    if (!isConnected) { connect(); return; }
    if (lpShares === 0n) { setError("No LP shares to withdraw"); return; }
    setError(null);

    try {
      setTxStep("Withdrawing liquidity…");
      await market.write("removeLiquidity", [lpShares]);
      setTxStep(null);
      setLpShares(0n);
      onComplete?.();
    } catch (e: unknown) {
      setError((e as Error).message ?? "Transaction failed");
      setTxStep(null);
    }
  };

  // After resolution, only show withdraw — and only if the user has LP shares
  if (resolved) {
    if (isConnected && !sharesLoaded) return null; // wait for load before hiding
    if (isConnected && sharesLoaded && lpShares === 0n) return null;
    return (
      <div className="glass-card p-5 space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">Your Liquidity</h3>
        {!isConnected ? (
          <button onClick={connect} className="arc-btn-primary w-full py-2.5 text-sm">
            Connect Wallet
          </button>
        ) : (
          <>
            <div className="rounded-xl bg-[rgba(116,91,255,0.05)] border border-[rgba(116,91,255,0.1)] px-4 py-3 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400">LP Shares</span>
              <span className="text-sm font-bold text-slate-800">{formatUsdc(lpShares)}</span>
            </div>
            <button
              onClick={handleRemove}
              disabled={!!txStep || lpShares === 0n}
              className="arc-btn-primary w-full py-2.5 text-sm disabled:opacity-60"
            >
              {txStep ? (
                <span className="flex items-center justify-center gap-2">
                  <Spinner size={14} /> {txStep}
                </span>
              ) : (
                "Withdraw Liquidity"
              )}
            </button>
            {error && (
              <p className="rounded-xl bg-red-500/8 border border-red-500/20 px-3 py-2 text-sm text-red-500">
                {error}
              </p>
            )}
          </>
        )}
      </div>
    );
  }

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
          {lpShares > 0n && (
            <div className="border-t border-[rgba(116,91,255,0.08)] pt-3 space-y-2">
              <p className="text-xs text-slate-500">
                Your shares: <span className="font-semibold text-slate-700">{formatUsdc(lpShares)}</span>
              </p>
              <button
                onClick={handleRemove}
                disabled={!!txStep}
                className="w-full rounded-full border border-[rgba(116,91,255,0.3)] py-2 text-sm font-semibold text-[#745BFF] hover:bg-[rgba(116,91,255,0.05)] transition-colors disabled:opacity-50"
              >
                Remove Liquidity
              </button>
            </div>
          )}
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
