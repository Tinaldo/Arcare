"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Spinner } from "@/components/ui/Spinner";
import { TokenLogo } from "@/components/tokens/TokenLogo";
import { useWallet } from "@/components/wallet/WalletContext";
import { arcClient, formatStableAmount } from "@/lib/arc-client";
import { PREDICTION_MARKET_ABI } from "@/lib/abis";
import { loadAllMarkets } from "@/lib/markets";
import { useContract } from "@/lib/use-contract";
import type { MarketOnChain } from "@/lib/types";
import type { WalletState } from "@/components/wallet/useWallet";

type Position = {
  market: MarketOnChain;
  yesBalance: bigint;
  noBalance: bigint;
  lpShares: bigint;
  totalLPShares: bigint;
};

function pct(price: bigint) {
  return Math.round((Number(price) / 1e18) * 100);
}

function markToMarket(tokens: bigint, price: bigint): bigint {
  return (tokens * price) / BigInt(1e18);
}

function timeLeft(deadline: bigint): string {
  const diff = Number(deadline) - Math.floor(Date.now() / 1000);
  if (diff <= 0) return "Expired";
  const days = Math.floor(diff / 86400);
  if (days > 0) return `${days}d left`;
  return `${Math.floor(diff / 3600)}h left`;
}

async function loadPositions(address: `0x${string}`): Promise<Position[]> {
  const markets = await loadAllMarkets();
  if (markets.length === 0) return [];

  const results = await Promise.all(
    markets.map(async (market) => {
      const [yesBalance, noBalance, lpShares, totalLPShares] = await Promise.all([
        arcClient.readContract({
          address: market.address as `0x${string}`,
          abi: PREDICTION_MARKET_ABI,
          functionName: "yesBalances",
          args: [address],
        }) as Promise<bigint>,
        arcClient.readContract({
          address: market.address as `0x${string}`,
          abi: PREDICTION_MARKET_ABI,
          functionName: "noBalances",
          args: [address],
        }) as Promise<bigint>,
        arcClient.readContract({
          address: market.address as `0x${string}`,
          abi: PREDICTION_MARKET_ABI,
          functionName: "lpShares",
          args: [address],
        }) as Promise<bigint>,
        arcClient.readContract({
          address: market.address as `0x${string}`,
          abi: PREDICTION_MARKET_ABI,
          functionName: "totalLPShares",
        }) as Promise<bigint>,
      ]);

      return {
        market,
        yesBalance,
        noBalance,
        lpShares,
        totalLPShares,
      } satisfies Position;
    })
  );

  return results.filter(
    (position) =>
      position.yesBalance > 0n ||
      position.noBalance > 0n ||
      position.lpShares > 0n
  );
}

function CoverageBar({ pct }: { pct: number }) {
  const color = pct >= 70 ? "#FF4D6A" : pct >= 40 ? "#F59E0B" : "#00C96E";
  return (
    <div className="mt-1.5">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Risk probability</span>
        <span className="text-xs font-bold" style={{ color }}>{pct}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function AmountStack({ entries }: { entries: Array<{ symbol: string; value: bigint }> }) {
  return (
    <div className="space-y-1">
      {entries.map((entry) => (
        <div key={entry.symbol} className="inline-flex items-center gap-2 text-sm font-extrabold text-slate-900">
          <TokenLogo symbol={entry.symbol} size={16} />
          {formatStableAmount(entry.value)} {entry.symbol}
        </div>
      ))}
    </div>
  );
}

function PositionCard({ pos, walletState, onComplete }: { pos: Position; walletState: WalletState; onComplete: () => void }) {
  const { market, yesBalance, noBalance, lpShares, totalLPShares } = pos;
  const { isConnected, connect } = walletState;
  const contract = useContract(market.address as `0x${string}`, PREDICTION_MARKET_ABI);

  const [txStep, setTxStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const yesPct = pct(market.yesPrice);
  const noPct = pct(market.noPrice);
  const yesCurrentValue = markToMarket(yesBalance, market.yesPrice);
  const noCurrentValue = markToMarket(noBalance, market.noPrice);
  const lpValue = totalLPShares > 0n ? (lpShares * market.totalCollateral) / totalLPShares : 0n;
  const isHack = market.category === "HACK";

  const handleRedeem = async () => {
    if (!isConnected) { connect(); return; }
    setError(null);
    setTxStep("Redeeming…");
    try {
      await contract.write("redeem", []);
      onComplete();
    } catch (e: unknown) {
      setError((e as Error).message ?? "Transaction failed");
    } finally {
      setTxStep(null);
    }
  };

  const handleWithdrawLP = async () => {
    if (!isConnected) { connect(); return; }
    setError(null);
    setTxStep("Withdrawing liquidity…");
    try {
      await contract.write("removeLiquidity", [lpShares]);
      onComplete();
    } catch (e: unknown) {
      setError((e as Error).message ?? "Transaction failed");
    } finally {
      setTxStep(null);
    }
  };

  const canRedeem = market.resolved && ((market.yesWins && yesBalance > 0n) || (!market.yesWins && noBalance > 0n));
  const redeemAmount = market.yesWins ? yesBalance : noBalance;

  return (
    <div className="glass-card space-y-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest ${
              isHack ? "bg-red-500/10 text-red-500" : "bg-[#745BFF]/10 text-[#745BFF]"
            }`}>
              <span className="material-symbols-outlined text-[12px]">{isHack ? "bug_report" : "currency_exchange"}</span>
              {market.category}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-900/5 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">
              <TokenLogo symbol={market.collateralSymbol} size={14} />
              {market.collateralSymbol}
            </span>
            {market.resolved ? (
              <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                market.yesWins ? "bg-yes-green/10 text-yes-green" : "bg-no-red/10 text-no-red"
              }`}>
                Resolved: {market.yesWins ? "YES" : "NO"}
              </span>
            ) : (
              <span className="text-[10px] font-medium text-slate-400">{timeLeft(market.deadline)}</span>
            )}
          </div>
          <Link href={`/markets/${market.address}`} className="line-clamp-2 text-sm font-bold leading-snug text-slate-900 transition-colors hover:text-[#745BFF]">
            {market.question}
          </Link>
        </div>
      </div>

      {yesBalance > 0n && (
        <div className="rounded-xl border border-[rgba(116,91,255,0.12)] bg-[rgba(116,91,255,0.04)] p-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-[#745BFF]">verified_user</span>
            <span className="text-sm font-bold text-[#745BFF]">YES Position</span>
          </div>
          <div className="mb-3 grid grid-cols-3 gap-3">
            <div>
              <div className="mb-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">Payout if YES</div>
              <div className="text-lg font-extrabold text-[#745BFF]">{formatStableAmount(yesBalance)} {market.collateralSymbol}</div>
            </div>
            <div>
              <div className="mb-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">Current value</div>
              <div className="text-lg font-extrabold text-slate-700">{formatStableAmount(yesCurrentValue)} {market.collateralSymbol}</div>
            </div>
            <div>
              <div className="mb-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">Tokens held</div>
              <div className="text-lg font-extrabold text-slate-700">{formatStableAmount(yesBalance)}</div>
            </div>
          </div>
          <div className="rounded-lg bg-white/60 px-3 py-2.5">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-600">Coverage level</span>
              <span className="text-xs font-bold text-[#745BFF]">{yesPct}% probability</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full transition-all" style={{ width: `${yesPct}%`, background: "linear-gradient(90deg, #5b3ee5, #745BFF)" }} />
            </div>
            <p className="mt-1.5 text-[11px] text-slate-500">
              Market currently prices this event at <strong>{yesPct}%</strong>.
              {yesPct < 30 && " Low risk — your protection is cheap."}
              {yesPct >= 30 && yesPct < 60 && " Moderate risk — protection is fairly priced."}
              {yesPct >= 60 && " High risk — event is likely, your payout is well covered."}
            </p>
          </div>
        </div>
      )}

      {noBalance > 0n && (
        <div className="rounded-xl border border-no-red/15 bg-no-red/5 p-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-no-red">trending_down</span>
            <span className="text-sm font-bold text-no-red">NO Position</span>
          </div>
          <div className="mb-3 grid grid-cols-3 gap-3">
            <div>
              <div className="mb-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">Payout if NO</div>
              <div className="text-lg font-extrabold text-no-red">{formatStableAmount(noBalance)} {market.collateralSymbol}</div>
            </div>
            <div>
              <div className="mb-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">Current value</div>
              <div className="text-lg font-extrabold text-slate-700">{formatStableAmount(noCurrentValue)} {market.collateralSymbol}</div>
            </div>
            <div>
              <div className="mb-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">Tokens held</div>
              <div className="text-lg font-extrabold text-slate-700">{formatStableAmount(noBalance)}</div>
            </div>
          </div>
          <CoverageBar pct={noPct} />
        </div>
      )}

      {lpShares > 0n && (
        <div className="space-y-3 rounded-xl border border-[rgba(116,91,255,0.12)] bg-white/40 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-[#745BFF]">water_drop</span>
              <span className="text-sm font-bold text-slate-700">LP Position</span>
            </div>
            <div className="text-right">
              <div className="text-lg font-extrabold text-slate-900">{formatStableAmount(lpValue)} {market.collateralSymbol}</div>
              <div className="text-[10px] text-slate-400">{formatStableAmount(lpShares)} shares</div>
            </div>
          </div>
          {market.resolved ? (
            <button
              onClick={handleWithdrawLP}
              disabled={!!txStep}
              className="w-full rounded-full border border-[#745BFF] py-2 text-sm font-bold text-[#745BFF] transition-colors hover:bg-[rgba(116,91,255,0.06)] disabled:opacity-50"
            >
              {txStep === "Withdrawing liquidity…" ? (
                <span className="flex items-center justify-center gap-2"><Spinner size={14} />Withdrawing…</span>
              ) : "Withdraw LP"}
            </button>
          ) : (
            <div className="flex items-center justify-center gap-2 rounded-full border border-amber-200 bg-amber-50 py-2 text-xs font-semibold text-amber-700">
              <span className="material-symbols-outlined text-[14px]">lock</span>
              Locked until resolution
            </div>
          )}
        </div>
      )}

      {canRedeem && (
        <button
          onClick={handleRedeem}
          disabled={!!txStep}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-yes-green py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {txStep === "Redeeming…" ? (
            <><Spinner size={14} />Redeeming…</>
          ) : (
            <><span className="material-symbols-outlined text-[16px]">redeem</span>Claim {formatStableAmount(redeemAmount)} {market.collateralSymbol}</>
          )}
        </button>
      )}

      {error && (
        <p className="rounded-xl border border-red-500/20 bg-red-500/8 px-3 py-2 text-sm text-red-500">{error}</p>
      )}
    </div>
  );
}

export default function PortfolioPage() {
  const walletState = useWallet();
  const { address, isConnected, connect } = walletState;
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    try {
      setPositions(await loadPositions(address));
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    if (isConnected && address) void refresh();
  }, [isConnected, address, refresh]);

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <span className="material-symbols-outlined text-[56px] text-[#745BFF] opacity-50">account_balance_wallet</span>
        <h1 className="text-2xl font-extrabold text-slate-900">Portfolio</h1>
        <p className="max-w-sm text-slate-500">Connect your wallet to see your positions and coverage.</p>
        <button onClick={connect} className="arc-btn-primary mt-2 px-6 py-2.5 text-sm">
          Connect Wallet
        </button>
      </div>
    );
  }

  if (loading) {
    return <div className="flex justify-center py-20"><Spinner size={32} /></div>;
  }

  const sumBySymbol = (picker: (position: Position) => bigint) => {
    const totals = new Map<string, bigint>();
    for (const position of positions) {
      const current = totals.get(position.market.collateralSymbol) ?? 0n;
      totals.set(position.market.collateralSymbol, current + picker(position));
    }
    return Array.from(totals.entries()).map(([symbol, value]) => ({ symbol, value }));
  };

  const totalProtection = sumBySymbol((position) => position.yesBalance);
  const totalCurrentValue = sumBySymbol((position) => {
    const yesValue = markToMarket(position.yesBalance, position.market.yesPrice);
    const noValue = markToMarket(position.noBalance, position.market.noPrice);
    const lpValue = position.totalLPShares > 0n
      ? (position.lpShares * position.market.totalCollateral) / position.totalLPShares
      : 0n;
    return yesValue + noValue + lpValue;
  });
  const pendingRedemptions = positions.filter(
    (position) =>
      position.market.resolved &&
      ((position.market.yesWins && position.yesBalance > 0n) || (!position.market.yesWins && position.noBalance > 0n))
  );

  if (positions.length === 0) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-extrabold text-slate-900">Portfolio</h1>
        <div className="glass-card flex flex-col items-center gap-3 py-20 text-center">
          <span className="material-symbols-outlined text-[48px] text-slate-300">shield</span>
          <p className="font-semibold text-slate-600">No positions yet.</p>
          <p className="max-w-sm text-sm text-slate-400">
            Buy YES tokens on a market to get coverage against a crypto incident.
          </p>
          <Link href="/" className="arc-btn-primary mt-2 px-6 py-2.5 text-sm">
            Browse Markets
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-slate-900">Portfolio</h1>
        <button
          onClick={refresh}
          className="flex items-center gap-1.5 rounded-full border border-[rgba(116,91,255,0.12)] bg-white/60 px-4 py-1.5 text-sm font-semibold text-slate-500 transition-colors hover:text-[#745BFF]"
        >
          <span className="material-symbols-outlined text-[16px]">refresh</span>
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="glass-card px-5 py-4">
          <div className="mb-1 flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-[#745BFF]">verified_user</span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Total Protection</span>
          </div>
          <AmountStack entries={totalProtection} />
          <div className="mt-0.5 text-[11px] text-slate-400">if all covered events occur</div>
        </div>

        <div className="glass-card px-5 py-4">
          <div className="mb-1 flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-yes-green">account_balance</span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Current Value</span>
          </div>
          <AmountStack entries={totalCurrentValue} />
          <div className="mt-0.5 text-[11px] text-slate-400">mark-to-market</div>
        </div>

        <div className="glass-card px-5 py-4">
          <div className="mb-1 flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-amber-500">pending_actions</span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Redeemable</span>
          </div>
          <div className="text-2xl font-extrabold text-slate-900">{pendingRedemptions.length}</div>
          <div className="mt-0.5 text-[11px] text-slate-400">
            {pendingRedemptions.length === 0 ? "no pending claims" : "ready to claim"}
          </div>
        </div>
      </div>

      {pendingRedemptions.length > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-yes-green/25 bg-yes-green/8 px-5 py-3">
          <span className="material-symbols-outlined text-[22px] text-yes-green">emoji_events</span>
          <div className="flex-1">
            <p className="text-sm font-bold text-yes-green">
              You have {pendingRedemptions.length} resolved market{pendingRedemptions.length > 1 ? "s" : ""} ready to claim!
            </p>
            <p className="text-xs text-slate-500">Click "Claim" on the position cards below.</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {positions.map((position) => (
          <PositionCard key={position.market.address} pos={position} walletState={walletState} onComplete={refresh} />
        ))}
      </div>
    </div>
  );
}
