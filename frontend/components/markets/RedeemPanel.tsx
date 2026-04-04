"use client";

import { useState } from "react";
import { Spinner } from "@/components/ui/Spinner";
import { redeemChallenge } from "@/lib/circle-api";
import type { CircleWalletState } from "@/components/wallet/useCircleWallet";
import type { MarketOnChain } from "@/lib/types";

interface Props {
  market: MarketOnChain;
  walletState: CircleWalletState;
  userYesBalance: bigint;
  userNoBalance: bigint;
  onComplete?: () => void;
}

export function RedeemPanel({ market, walletState, userYesBalance, userNoBalance, onComplete }: Props) {
  const { isConnected, wallet, userToken, executeChallenge, refreshBalance } = walletState;
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!market.resolved) return null;

  const winningBalance = market.yesWins ? userYesBalance : userNoBalance;
  if (winningBalance === 0n) return null;

  const handleRedeem = async () => {
    if (!isConnected || !wallet || !userToken) return;
    setLoading(true);
    setError(null);
    try {
      const ch = await redeemChallenge(userToken, wallet.id, market.address);
      await executeChallenge(ch.challengeId);
      await refreshBalance();
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
      <div className="rounded-2xl border border-green-500/30 bg-green-500/10 p-5 text-center text-green-400">
        <div className="mb-1 text-2xl">✓</div>
        <p className="font-medium">Redeemed successfully!</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-green-500/30 bg-green-500/10 p-5">
      <h3 className="mb-1 font-semibold text-green-400">You won!</h3>
      <p className="mb-4 text-sm text-gray-300">
        Market resolved:{" "}
        <span className="font-semibold text-white">{market.yesWins ? "YES" : "NO"}</span>.
        Redeem {(Number(winningBalance) / 1e6).toFixed(2)} USDC.
      </p>
      <button
        onClick={handleRedeem}
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-500 py-3 text-sm font-semibold text-white hover:bg-green-400 disabled:opacity-60"
      >
        {loading ? <><Spinner size={16} /> Redeeming…</> : "Redeem Winnings"}
      </button>
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
    </div>
  );
}
