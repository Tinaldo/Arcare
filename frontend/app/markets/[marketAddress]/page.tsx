"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { ProbabilityBar } from "@/components/markets/ProbabilityBar";
import { TradePanel } from "@/components/markets/TradePanel";
import { LiquidityPanel } from "@/components/markets/LiquidityPanel";
import { RedeemPanel } from "@/components/markets/RedeemPanel";
import { useWallet } from "@/components/wallet/WalletContext";
import { arcClient, formatUsdc } from "@/lib/arc-client";
import { PREDICTION_MARKET_ABI } from "@/lib/abis";
import type { MarketOnChain } from "@/lib/types";

function formatDeadline(deadline: bigint): string {
  return new Date(Number(deadline) * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function MarketPage() {
  const { marketAddress } = useParams<{ marketAddress: string }>();
  const walletState = useWallet();
  const { address, isConnected } = walletState;

  const [market, setMarket] = useState<MarketOnChain | null>(null);
  const [loading, setLoading] = useState(true);
  const [userYes, setUserYes] = useState(0n);
  const [userNo, setUserNo] = useState(0n);

  const loadMarket = useCallback(async () => {
    const addr = marketAddress as `0x${string}`;
    const info = await arcClient.readContract({
      address: addr,
      abi: PREDICTION_MARKET_ABI,
      functionName: "getMarketInfo",
    });
    const [question, category, deadline, resolved, yesWins, yesReserve, noReserve, totalCollateral, yesPrice, noPrice] =
      info as [string, string, bigint, boolean, boolean, bigint, bigint, bigint, bigint, bigint];
    setMarket({ address: marketAddress, question, category, deadline, resolved, yesWins, yesReserve, noReserve, totalCollateral, yesPrice, noPrice });
  }, [marketAddress]);

  const loadUserBalances = useCallback(async () => {
    if (!address) return;
    const addr = marketAddress as `0x${string}`;
    const [yes, no] = await Promise.all([
      arcClient.readContract({ address: addr, abi: PREDICTION_MARKET_ABI, functionName: "yesBalances", args: [address] }),
      arcClient.readContract({ address: addr, abi: PREDICTION_MARKET_ABI, functionName: "noBalances", args: [address] }),
    ]);
    setUserYes(yes as bigint);
    setUserNo(no as bigint);
  }, [marketAddress, address]);

  useEffect(() => {
    setLoading(true);
    loadMarket().finally(() => setLoading(false));
  }, [loadMarket]);

  useEffect(() => {
    if (isConnected) void loadUserBalances();
  }, [isConnected, loadUserBalances]);

  const refresh = () => {
    void loadMarket();
    void loadUserBalances();
  };

  if (loading) {
    return <div className="flex justify-center py-20"><Spinner size={32} /></div>;
  }

  if (!market) {
    return <div className="py-20 text-center text-gray-500">Market not found.</div>;
  }

  const catVariant = market.category === "DEPEG" ? "depeg" : "hack";

  return (
    <div>
      <Link href="/" className="mb-6 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-800">
        ← All Markets
      </Link>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="rounded-2xl border border-arc-border bg-arc-card p-6">
            <div className="mb-3 flex flex-wrap gap-2">
              <Badge label={market.category} variant={catVariant} />
              <Badge label={market.resolved ? "Resolved" : "Active"} variant={market.resolved ? "resolved" : "active"} />
            </div>
            <h1 className="mb-4 text-xl font-bold leading-snug text-slate-900">{market.question}</h1>
            <ProbabilityBar yesPrice={market.yesPrice} noPrice={market.noPrice} />
            <div className="mt-5 grid grid-cols-3 divide-x divide-arc-border rounded-xl border border-arc-border">
              {[
                { label: "Liquidity", value: `${formatUsdc(market.totalCollateral)} USDC` },
                { label: "Deadline", value: formatDeadline(market.deadline) },
                { label: "Outcome", value: market.resolved ? (market.yesWins ? "YES ✓" : "NO ✓") : "Open" },
              ].map((s) => (
                <div key={s.label} className="px-4 py-3 text-center">
                  <div className="text-sm font-semibold text-slate-800">{s.value}</div>
                  <div className="text-xs text-slate-400">{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {isConnected && (userYes > 0n || userNo > 0n) && (
            <div className="rounded-2xl border border-arc-border bg-arc-card p-5">
              <h3 className="mb-3 text-sm font-semibold text-slate-600">Your Position</h3>
              <div className="flex gap-4">
                {userYes > 0n && (
                  <div className="flex-1 rounded-xl border border-yes-green/30 bg-yes-green/10 p-3 text-center">
                    <div className="text-lg font-bold text-yes-green">{formatUsdc(userYes)}</div>
                    <div className="text-xs text-slate-400">YES tokens</div>
                  </div>
                )}
                {userNo > 0n && (
                  <div className="flex-1 rounded-xl border border-no-red/30 bg-no-red/10 p-3 text-center">
                    <div className="text-lg font-bold text-no-red">{formatUsdc(userNo)}</div>
                    <div className="text-xs text-slate-400">NO tokens</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {!market.resolved && (
            <LiquidityPanel marketAddress={marketAddress} walletState={walletState} onComplete={refresh} />
          )}
        </div>

        <div className="space-y-4">
          {market.resolved ? (
            <RedeemPanel market={market} walletState={walletState} userYesBalance={userYes} userNoBalance={userNo} onComplete={refresh} />
          ) : (
            <TradePanel marketAddress={marketAddress} walletState={walletState} onTxComplete={refresh} />
          )}
          <a
            href={`https://testnet.arcscan.app/address/${marketAddress}`}
            target="_blank"
            rel="noreferrer"
            className="block rounded-xl border border-arc-border bg-arc-card px-4 py-3 text-center text-xs text-slate-400 hover:text-slate-700"
          >
            View contract on ArcScan ↗
          </a>
        </div>
      </div>
    </div>
  );
}
