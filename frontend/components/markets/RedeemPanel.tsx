"use client";

import { useState } from "react";
import { Spinner } from "@/components/ui/Spinner";
import { PREDICTION_MARKET_ABI } from "@/lib/abis";
import { useContract } from "@/lib/use-contract";
import type { WalletState } from "@/components/wallet/useWallet";
import type { MarketOnChain } from "@/lib/types";

interface Props {
  market: MarketOnChain;
  walletState: WalletState;
  userYesBalance: bigint;
  userNoBalance: bigint;
  onComplete?: () => void;
}

export function RedeemPanel({ market, walletState, userYesBalance, userNoBalance, onComplete }: Props) {
  const { isConnected } = walletState;
  const contract = useContract(market.address as `0x${string}`, PREDICTION_MARKET_ABI);

  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!market.resolved) return null;

  const winningBalance = market.yesWins ? userYesBalance : userNoBalance;
  if (winningBalance === 0n) return null;

  const handleRedeem = async () => {
    if (!isConnected) return;
    setLoading(true);
    setError(null);
    try {
      await contract.write("redeem", []);
      setDone(true);
      onComplete?.();
    } catch (e: unknown) {
      setError((e as Error).message ?? "Redeem failed");
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="glass-card p-5 text-center border-yes-green/25">
        <span className="material-symbols-outlined text-[40px] text-yes-green mb-2">check_circle</span>
        <p className="font-bold text-yes-green">Redeemed successfully!</p>
      </div>
    );
  }

  return (
    <div className="glass-card p-5 border-yes-green/25">
      <div className="mb-1 flex items-center gap-2">
        <span className="material-symbols-outlined text-[20px] text-yes-green">emoji_events</span>
        <h3 className="font-bold text-yes-green">You won!</h3>
      </div>
      <p className="mb-4 text-sm text-slate-600">
        Market resolved:{" "}
        <span className="font-bold text-slate-900">{market.yesWins ? "YES" : "NO"}</span>.
        Redeem {(Number(winningBalance) / 1e6).toFixed(2)} USDC.
      </p>
      <button
        onClick={handleRedeem}
        disabled={loading}
        className="w-full rounded-full bg-yes-green py-3 text-sm font-bold text-white hover:opacity-90 disabled:opacity-60 transition-opacity"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <Spinner size={16} /> Redeeming…
          </span>
        ) : (
          "Redeem Winnings"
        )}
      </button>
      {error && (
        <p className="mt-3 rounded-xl bg-red-500/8 border border-red-500/20 px-3 py-2 text-sm text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}
