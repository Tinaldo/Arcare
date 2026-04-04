"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Spinner } from "@/components/ui/Spinner";
import { useWallet } from "@/components/wallet/WalletContext";
import { arcClient, formatUsdc } from "@/lib/arc-client";
import { MARKET_FACTORY_ABI, PREDICTION_MARKET_ABI, DEPEG_RESOLVER_ABI } from "@/lib/abis";
import { MARKET_FACTORY_ADDRESS, DEPEG_RESOLVER_ADDRESS } from "@/lib/addresses";
import { useContract } from "@/lib/use-contract";
import type { MarketOnChain } from "@/lib/types";
import type { WalletState } from "@/components/wallet/useWallet";

type Position = {
  market: MarketOnChain;
  yesBalance: bigint;
  noBalance: bigint;
  lpShares: bigint;
  resolverLPShares: bigint;
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
  if (MARKET_FACTORY_ADDRESS === "0x0") return [];

  const count = await arcClient.readContract({
    address: MARKET_FACTORY_ADDRESS,
    abi: MARKET_FACTORY_ABI,
    functionName: "getMarketCount",
  }) as bigint;

  if (count === 0n) return [];

  const addresses = await arcClient.readContract({
    address: MARKET_FACTORY_ADDRESS,
    abi: MARKET_FACTORY_ABI,
    functionName: "getMarkets",
    args: [0n, count],
  }) as `0x${string}`[];

  const results = await Promise.all(
    addresses.map(async (addr) => {
      const [info, yesBalance, noBalance, lpShares, resolverLPShares, totalLPShares] = await Promise.all([
        arcClient.readContract({
          address: addr,
          abi: PREDICTION_MARKET_ABI,
          functionName: "getMarketInfo",
        }),
        arcClient.readContract({
          address: addr,
          abi: PREDICTION_MARKET_ABI,
          functionName: "yesBalances",
          args: [address],
        }) as Promise<bigint>,
        arcClient.readContract({
          address: addr,
          abi: PREDICTION_MARKET_ABI,
          functionName: "noBalances",
          args: [address],
        }) as Promise<bigint>,
        arcClient.readContract({
          address: addr,
          abi: PREDICTION_MARKET_ABI,
          functionName: "lpShares",
          args: [address],
        }) as Promise<bigint>,
        arcClient.readContract({
          address: addr,
          abi: PREDICTION_MARKET_ABI,
          functionName: "lpShares",
          args: [DEPEG_RESOLVER_ADDRESS as `0x${string}`],
        }) as Promise<bigint>,
        arcClient.readContract({
          address: addr,
          abi: PREDICTION_MARKET_ABI,
          functionName: "totalLPShares",
        }) as Promise<bigint>,
      ]);

      const [question, category, deadline, resolved, yesWins, yesReserve, noReserve, totalCollateral, yesPrice, noPrice] =
        info as [string, string, bigint, boolean, boolean, bigint, bigint, bigint, bigint, bigint];

      return {
        market: { address: addr, question, category, deadline, resolved, yesWins, yesReserve, noReserve, totalCollateral, yesPrice, noPrice },
        yesBalance,
        noBalance,
        lpShares,
        resolverLPShares,
        totalLPShares,
      } satisfies Position;
    })
  );

  return results.filter(
    (p) => p.yesBalance > 0n || p.noBalance > 0n || p.lpShares > 0n || p.resolverLPShares > 0n
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function CoverageBar({ pct }: { pct: number }) {
  const color = pct >= 70 ? "#FF4D6A" : pct >= 40 ? "#F59E0B" : "#00C96E";
  return (
    <div className="mt-1.5">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Risk probability</span>
        <span className="text-xs font-bold" style={{ color }}>{pct}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}

function PositionCard({ pos, walletState, onComplete }: { pos: Position; walletState: WalletState; onComplete: () => void }) {
  const { market, yesBalance, noBalance, lpShares, resolverLPShares, totalLPShares } = pos;
  const { isConnected, connect } = walletState;
  const contract = useContract(market.address as `0x${string}`, PREDICTION_MARKET_ABI);
  const resolver = useContract(DEPEG_RESOLVER_ADDRESS as `0x${string}`, DEPEG_RESOLVER_ABI);

  const [txStep, setTxStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const yesPct = pct(market.yesPrice);
  const noPct = pct(market.noPrice);

  const yesCurrentValue = markToMarket(yesBalance, market.yesPrice);
  const noCurrentValue = markToMarket(noBalance, market.noPrice);
  const lpValue = totalLPShares > 0n
    ? (lpShares * market.totalCollateral) / totalLPShares
    : 0n;

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

  const handleClaimProtocolLP = async () => {
    if (!isConnected) { connect(); return; }
    setError(null);
    setTxStep("Claiming protocol liquidity…");
    try {
      await resolver.write("claimLiquidity", [market.address]);
      onComplete();
    } catch (e: unknown) {
      setError((e as Error).message ?? "Transaction failed");
    } finally {
      setTxStep(null);
    }
  };

  const canRedeem = market.resolved && (
    (market.yesWins && yesBalance > 0n) || (!market.yesWins && noBalance > 0n)
  );
  const redeemAmount = market.yesWins ? yesBalance : noBalance;

  return (
    <div className="glass-card p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="mb-1.5 flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest ${
              isHack ? "bg-red-500/10 text-red-500" : "bg-[#745BFF]/10 text-[#745BFF]"
            }`}>
              <span className="material-symbols-outlined text-[12px]">{isHack ? "bug_report" : "currency_exchange"}</span>
              {market.category}
            </span>
            {market.resolved && (
              <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                market.yesWins ? "bg-yes-green/10 text-yes-green" : "bg-no-red/10 text-no-red"
              }`}>
                Resolved: {market.yesWins ? "YES" : "NO"}
              </span>
            )}
            {!market.resolved && (
              <span className="text-[10px] text-slate-400 font-medium">{timeLeft(market.deadline)}</span>
            )}
          </div>
          <Link href={`/markets/${market.address}`} className="text-sm font-bold text-slate-900 hover:text-[#745BFF] transition-colors line-clamp-2 leading-snug">
            {market.question}
          </Link>
        </div>
      </div>

      {/* YES position */}
      {yesBalance > 0n && (
        <div className="rounded-xl border border-[rgba(116,91,255,0.12)] bg-[rgba(116,91,255,0.04)] p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-[18px] text-[#745BFF]">verified_user</span>
            <span className="text-sm font-bold text-[#745BFF]">YES Position</span>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Payout if YES</div>
              <div className="text-lg font-extrabold text-[#745BFF]">{formatUsdc(yesBalance)} USDC</div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Current value</div>
              <div className="text-lg font-extrabold text-slate-700">{formatUsdc(yesCurrentValue)} USDC</div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Tokens held</div>
              <div className="text-lg font-extrabold text-slate-700">{formatUsdc(yesBalance)}</div>
            </div>
          </div>

          <div className="rounded-lg bg-white/60 px-3 py-2.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-slate-600">Coverage level</span>
              <span className="text-xs font-bold text-[#745BFF]">{yesPct}% probability</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${yesPct}%`, background: `linear-gradient(90deg, #5b3ee5, #745BFF)` }}
              />
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

      {/* NO position */}
      {noBalance > 0n && (
        <div className="rounded-xl border border-no-red/15 bg-no-red/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-[18px] text-no-red">trending_down</span>
            <span className="text-sm font-bold text-no-red">NO Position</span>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Payout if NO</div>
              <div className="text-lg font-extrabold text-no-red">{formatUsdc(noBalance)} USDC</div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Current value</div>
              <div className="text-lg font-extrabold text-slate-700">{formatUsdc(noCurrentValue)} USDC</div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Tokens held</div>
              <div className="text-lg font-extrabold text-slate-700">{formatUsdc(noBalance)}</div>
            </div>
          </div>

          <CoverageBar pct={noPct} />
        </div>
      )}

      {/* LP position */}
      {lpShares > 0n && (
        <div className="rounded-xl border border-[rgba(116,91,255,0.12)] bg-white/40 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-[#745BFF]">water_drop</span>
              <span className="text-sm font-bold text-slate-700">LP Position</span>
            </div>
            <div className="text-right">
              <div className="text-lg font-extrabold text-slate-900">{formatUsdc(lpValue)} USDC</div>
              <div className="text-[10px] text-slate-400">{formatUsdc(lpShares)} shares</div>
            </div>
          </div>
          <button
            onClick={handleWithdrawLP}
            disabled={!!txStep}
            className="w-full rounded-full border border-[#745BFF] py-2 text-sm font-bold text-[#745BFF] hover:bg-[rgba(116,91,255,0.06)] transition-colors disabled:opacity-50"
          >
            {txStep === "Withdrawing liquidity…" ? (
              <span className="flex items-center justify-center gap-2"><Spinner size={14} />Withdrawing…</span>
            ) : "Withdraw LP"}
          </button>
        </div>
      )}

      {/* Protocol LP (initial liquidity held by DepegResolver) */}
      {resolverLPShares > 0n && (
        <div className="rounded-xl border border-amber-400/25 bg-amber-50/60 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-amber-500">lock</span>
              <span className="text-sm font-bold text-slate-700">Protocol LP</span>
              <span className="text-[10px] text-slate-400">(initial liquidity)</span>
            </div>
            <div className="text-right">
              <div className="text-lg font-extrabold text-slate-900">
                {formatUsdc(totalLPShares > 0n ? (resolverLPShares * market.totalCollateral) / totalLPShares : 0n)} USDC
              </div>
              <div className="text-[10px] text-slate-400">{formatUsdc(resolverLPShares)} shares</div>
            </div>
          </div>
          <button
            onClick={handleClaimProtocolLP}
            disabled={!!txStep}
            className="w-full rounded-full border border-amber-400 py-2 text-sm font-bold text-amber-600 hover:bg-amber-50 transition-colors disabled:opacity-50"
          >
            {txStep === "Claiming protocol liquidity…" ? (
              <span className="flex items-center justify-center gap-2"><Spinner size={14} />Claiming…</span>
            ) : "Claim Protocol LP"}
          </button>
        </div>
      )}

      {/* Redeem button — shown when resolved and user holds winning tokens */}
      {canRedeem && (
        <button
          onClick={handleRedeem}
          disabled={!!txStep}
          className="w-full flex items-center justify-center gap-2 rounded-full bg-yes-green py-2.5 text-sm font-bold text-white hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {txStep === "Redeeming…" ? (
            <><Spinner size={14} />Redeeming…</>
          ) : (
            <><span className="material-symbols-outlined text-[16px]">redeem</span>Claim {formatUsdc(redeemAmount)} USDC</>
          )}
        </button>
      )}

      {error && (
        <p className="rounded-xl bg-red-500/8 border border-red-500/20 px-3 py-2 text-sm text-red-500">{error}</p>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PortfolioPage() {
  const walletState = useWallet();
  const { address, isConnected, connect } = walletState;
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    try {
      const pos = await loadPositions(address);
      setPositions(pos);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    if (isConnected && address) void refresh();
  }, [isConnected, address, refresh]);

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
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

  const totalProtection = positions.reduce((sum, p) => sum + p.yesBalance, 0n);
  const totalCurrentValue = positions.reduce((sum, p) => {
    const yesVal = markToMarket(p.yesBalance, p.market.yesPrice);
    const noVal = markToMarket(p.noBalance, p.market.noPrice);
    const lpVal = p.totalLPShares > 0n
      ? ((p.lpShares + p.resolverLPShares) * p.market.totalCollateral) / p.totalLPShares
      : 0n;
    return sum + yesVal + noVal + lpVal;
  }, 0n);
  const pendingRedemptions = positions.filter(
    (p) => p.market.resolved && ((p.market.yesWins && p.yesBalance > 0n) || (!p.market.yesWins && p.noBalance > 0n))
  );

  if (positions.length === 0) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-extrabold text-slate-900">Portfolio</h1>
        <div className="glass-card flex flex-col items-center gap-3 py-20 text-center">
          <span className="material-symbols-outlined text-[48px] text-slate-300">shield</span>
          <p className="font-semibold text-slate-600">No positions yet.</p>
          <p className="text-sm text-slate-400 max-w-sm">
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
          className="flex items-center gap-1.5 rounded-full bg-white/60 border border-[rgba(116,91,255,0.12)] px-4 py-1.5 text-sm font-semibold text-slate-500 hover:text-[#745BFF] transition-colors"
        >
          <span className="material-symbols-outlined text-[16px]">refresh</span>
          Refresh
        </button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="glass-card px-5 py-4">
          <div className="mb-1 flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-[#745BFF]">verified_user</span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Total Protection</span>
          </div>
          <div className="text-2xl font-extrabold text-[#745BFF]">{formatUsdc(totalProtection)} USDC</div>
          <div className="text-[11px] text-slate-400 mt-0.5">if all covered events occur</div>
        </div>

        <div className="glass-card px-5 py-4">
          <div className="mb-1 flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-yes-green">account_balance</span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Current Value</span>
          </div>
          <div className="text-2xl font-extrabold text-slate-900">{formatUsdc(totalCurrentValue)} USDC</div>
          <div className="text-[11px] text-slate-400 mt-0.5">mark-to-market</div>
        </div>

        <div className="glass-card px-5 py-4">
          <div className="mb-1 flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-amber-500">pending_actions</span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Redeemable</span>
          </div>
          <div className="text-2xl font-extrabold text-slate-900">{pendingRedemptions.length}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {pendingRedemptions.length === 0 ? "no pending claims" : "ready to claim"}
          </div>
        </div>
      </div>

      {/* Pending redemptions banner */}
      {pendingRedemptions.length > 0 && (
        <div className="rounded-xl border border-yes-green/25 bg-yes-green/8 px-5 py-3 flex items-center gap-3">
          <span className="material-symbols-outlined text-[22px] text-yes-green">emoji_events</span>
          <div className="flex-1">
            <p className="text-sm font-bold text-yes-green">
              You have {pendingRedemptions.length} resolved market{pendingRedemptions.length > 1 ? "s" : ""} ready to claim!
            </p>
            <p className="text-xs text-slate-500">Click "Claim" on the position cards below.</p>
          </div>
        </div>
      )}

      {/* Position cards */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {positions.map((pos) => (
          <PositionCard key={pos.market.address} pos={pos} walletState={walletState} onComplete={refresh} />
        ))}
      </div>
    </div>
  );
}
