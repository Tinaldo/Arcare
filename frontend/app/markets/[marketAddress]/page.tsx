"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { ProbabilityBar } from "@/components/markets/ProbabilityBar";
import { TradePanel } from "@/components/markets/TradePanel";
import { LiquidityPanel } from "@/components/markets/LiquidityPanel";
import { RedeemPanel } from "@/components/markets/RedeemPanel";
import { TokenLogo } from "@/components/tokens/TokenLogo";
import { YesNoPriceChart } from "@/components/charts/YesNoPriceChart";
import { StablecoinPriceChart } from "@/components/charts/StablecoinPriceChart";
import { DepegGauge } from "@/components/charts/DepegGauge";
import { useWallet } from "@/components/wallet/WalletContext";
import { arcClient, formatStableAmount, parseDepegThreshold } from "@/lib/arc-client";
import { PREDICTION_MARKET_ABI, DEPEG_RESOLVER_ABI } from "@/lib/abis";
import { loadAllMarkets, loadMarketByAddress } from "@/lib/markets";
import type { MarketOnChain } from "@/lib/types";

const sepoliaClient = createPublicClient({
  chain: sepolia,
  transport: http("https://ethereum-sepolia-rpc.publicnode.com"),
});

const DEPEG_FEEDS: Record<string, { address: `0x${string}`; color: string }> = {
  DAI:  { address: "0x14866185B1962B63C3Ea9E03Bc1da838bab34C19", color: "#f59e0b" },
  FRAX: { address: "0x0b9E1E3a9FEBB3C3AeFc5B3875Ea5Ca8F6CA3519", color: "#8b5cf6" },
  LUSD: { address: "0x3D7aE7E594f2f2091Ad8798313450130d0Aba3a0", color: "#06b6d4" },
};

const LATEST_ROUND_ABI = [{
  name: "latestRoundData", type: "function", stateMutability: "view",
  inputs: [],
  outputs: [
    { name: "roundId", type: "uint80" }, { name: "answer", type: "int256" },
    { name: "startedAt", type: "uint256" }, { name: "updatedAt", type: "uint256" },
    { name: "answeredInRound", type: "uint80" },
  ],
}] as const;

function parseDepegAsset(question: string): string | null {
  const match = question.match(/^Will ([A-Za-z0-9]+) depeg/i);
  return match ? match[1].toUpperCase() : null;
}

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
  const [currencyMarkets, setCurrencyMarkets] = useState<MarketOnChain[]>([]);
  const [loading, setLoading] = useState(true);
  const [userYes, setUserYes] = useState(0n);
  const [userNo, setUserNo] = useState(0n);
  const [livePrice, setLivePrice] = useState<number | null>(null);

  const loadMarket = useCallback(async () => {
    const addr = marketAddress as `0x${string}`;
    const [loadedMarket, allMarkets] = await Promise.all([
      loadMarketByAddress(addr),
      loadAllMarkets(),
    ]);

    setMarket(loadedMarket);

    if (!loadedMarket) {
      setCurrencyMarkets([]);
      return;
    }

    const related = allMarkets.filter((candidate) => candidate.pairKey === loadedMarket.pairKey);
    const deduped = related.some((candidate) => candidate.address === loadedMarket.address)
      ? related
      : [...related, loadedMarket];

    setCurrencyMarkets(
      [...deduped].sort((left, right) => left.collateralSymbol.localeCompare(right.collateralSymbol))
    );
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

  // Poll market state every 10s to pick up trades and resolution
  useEffect(() => {
    const id = setInterval(() => void loadMarket(), 10_000);
    return () => clearInterval(id);
  }, [loadMarket]);

  useEffect(() => {
    if (isConnected) void loadUserBalances();
  }, [isConnected, loadUserBalances]);

  // Fetch live price for DEPEG markets.
  // Priority: DepegResolver.lastMarketPrice (reflects on-chain / simulated price)
  // Fallback: Chainlink Sepolia feed (for markets with no price submitted yet)
  useEffect(() => {
    if (!market || market.category !== "DEPEG") return;
    const asset = parseDepegAsset(market.question);
    const feed = asset ? DEPEG_FEEDS[asset] : null;

    const fetchPrice = async () => {
      // 1. Try DepegResolver on-chain price
      if (market.resolverAddress && market.resolverAddress !== "0x0") {
        try {
          const raw = await arcClient.readContract({
            address: market.resolverAddress,
            abi: DEPEG_RESOLVER_ABI,
            functionName: "lastMarketPrice",
            args: [market.address as `0x${string}`],
          }) as bigint;
          if (raw > 0n) {
            setLivePrice(Number(raw) / 1e8);
            return;
          }
        } catch { /* fall through */ }
      }
      // 2. Fallback: Chainlink Sepolia
      if (feed) {
        try {
          const [, answer] = await sepoliaClient.readContract({
            address: feed.address,
            abi: LATEST_ROUND_ABI,
            functionName: "latestRoundData",
          }) as [bigint, bigint, bigint, bigint, bigint];
          setLivePrice(Number(answer) / 1e8);
        } catch { /* feed unavailable */ }
      }
    };
    void fetchPrice();
    const id = setInterval(() => void fetchPrice(), 10_000);
    return () => clearInterval(id);
  }, [market]);

  const refresh = () => {
    void loadMarket();
    void loadUserBalances();
  };

  if (loading) {
    return <div className="flex justify-center py-20"><Spinner size={32} /></div>;
  }

  if (!market) {
    return <div className="py-20 text-center text-slate-400">Market not found.</div>;
  }

  const catVariant = market.category === "DEPEG" ? "depeg" : "hack";
  const yesPct = Math.round((Number(market.yesPrice) / 1e18) * 100);
  const depegThreshold = market.category === "DEPEG" ? parseDepegThreshold(market.question) : null;
  const depegAsset = market.category === "DEPEG" ? parseDepegAsset(market.question) : null;
  const depegFeed = depegAsset ? DEPEG_FEEDS[depegAsset] : null;

  return (
    <div>
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1.5 rounded-full bg-white/60 border border-[rgba(116,91,255,0.12)] px-4 py-1.5 text-sm font-semibold text-slate-500 hover:text-[#745BFF] transition-colors"
      >
        <span className="material-symbols-outlined text-[16px]">arrow_back</span>
        All Markets
      </Link>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left: market info */}
        <div className="space-y-5 lg:col-span-2">
          <div className="glass-card p-6">
            <div className="mb-3 flex flex-wrap gap-2">
              <Badge label={market.category} variant={catVariant} />
              <Badge label={market.resolved ? "Resolved" : "Active"} variant={market.resolved ? "resolved" : "active"} />
              <span className="inline-flex items-center gap-2 rounded-full bg-slate-900/5 px-3 py-1 text-xs font-bold uppercase tracking-widest text-slate-500">
                <TokenLogo symbol={market.collateralSymbol} size={16} />
                {market.collateralSymbol}
              </span>
            </div>
            <h1 className="mb-4 text-xl font-extrabold leading-snug text-slate-900">{market.question}</h1>

            {currencyMarkets.length > 1 && (
              <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-[rgba(116,91,255,0.12)] bg-[rgba(116,91,255,0.05)] p-2">
                <span className="px-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  Currency
                </span>
                {currencyMarkets.map((currencyMarket) => {
                  const active = currencyMarket.address === market.address;
                  return (
                    <Link
                      key={currencyMarket.address}
                      href={`/markets/${currencyMarket.address}`}
                      className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-bold uppercase tracking-widest transition-all ${
                        active
                          ? "bg-slate-900 text-white shadow-sm"
                          : "bg-white/80 text-slate-500 hover:text-slate-900"
                      }`}
                    >
                      <TokenLogo symbol={currencyMarket.collateralSymbol} size={16} />
                      {currencyMarket.collateralSymbol}
                    </Link>
                  );
                })}
              </div>
            )}

            {/* Big probability display */}
            <div className="mb-4 flex items-baseline gap-2">
              <span className="text-4xl font-extrabold text-[#745BFF]">{yesPct}%</span>
              <span className="text-sm text-slate-400 font-medium">probability of YES</span>
            </div>

            <ProbabilityBar yesPrice={market.yesPrice} noPrice={market.noPrice} />

            <div className={`mt-5 grid gap-3 ${depegThreshold ? "grid-cols-4" : "grid-cols-3"}`}>
              {[
                {
                  icon: "water_drop",
                  label: "Liquidity",
                  value: (
                    <span className="inline-flex items-center justify-center gap-2">
                      <TokenLogo symbol={market.collateralSymbol} size={16} />
                      {formatStableAmount(market.totalCollateral)} {market.collateralSymbol}
                    </span>
                  ),
                },
                { icon: "event", label: "Deadline", value: formatDeadline(market.deadline) },
                { icon: "check_circle", label: "Outcome", value: market.resolved ? (market.yesWins ? "YES ✓" : "NO ✓") : "Open" },
                ...(depegThreshold ? [{ icon: "warning", label: "Threshold", value: `$${depegThreshold}` }] : []),
              ].map((s) => (
                <div key={s.label} className="rounded-xl bg-[rgba(116,91,255,0.05)] border border-[rgba(116,91,255,0.1)] px-4 py-3 text-center">
                  <div className="mb-0.5 flex justify-center">
                    <span className="material-symbols-outlined text-[16px] text-[#745BFF]">{s.icon}</span>
                  </div>
                  <div className="text-sm font-bold text-slate-800">{s.value}</div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* User position */}
          {isConnected && (userYes > 0n || userNo > 0n) && (
            <div className="glass-card p-5">
              <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">Your Position</h3>
              <div className="flex gap-4">
                {userYes > 0n && (
                  <div className="flex-1 rounded-xl border border-yes-green/25 bg-yes-green/8 p-3 text-center">
                    <div className="text-lg font-extrabold text-yes-green">{formatStableAmount(userYes)}</div>
                    <div className="text-xs text-slate-400 font-medium">YES tokens</div>
                  </div>
                )}
                {userNo > 0n && (
                  <div className="flex-1 rounded-xl border border-no-red/25 bg-no-red/8 p-3 text-center">
                    <div className="text-lg font-extrabold text-no-red">{formatStableAmount(userNo)}</div>
                    <div className="text-xs text-slate-400 font-medium">NO tokens</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* YES / NO price history */}
          <div className="glass-card p-5">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">Price History</h3>
            <YesNoPriceChart
              marketId={0}
              contractAddress={marketAddress as `0x${string}`}
              abi={PREDICTION_MARKET_ABI}
            />
          </div>

          {/* Stablecoin live prices — DEPEG markets only */}
          {market.category === "DEPEG" && depegFeed && depegAsset && (
            <div className="glass-card p-5">
              <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">
                Live Stablecoin Price
              </h3>
              <StablecoinPriceChart
                stablecoins={[{ symbol: depegAsset, color: depegFeed.color, feedAddress: depegFeed.address }]}
              />
            </div>
          )}

          <LiquidityPanel
            marketAddress={marketAddress}
            collateralAddress={market.collateralTokenAddress}
            collateralSymbol={market.collateralSymbol}
            walletState={walletState}
            resolved={market.resolved}
            onComplete={refresh}
          />
        </div>

        {/* Right: trade/redeem panel */}
        <div className="space-y-4">
          {/* Depeg gauge — DEPEG markets only */}
          {market.category === "DEPEG" && depegAsset && (
            <div className="glass-card p-5 flex justify-center">
              {livePrice !== null ? (
                <DepegGauge symbol={depegAsset} price={livePrice} />
              ) : (
                <div className="flex flex-col items-center gap-2 py-8 text-slate-400">
                  <Spinner size={20} />
                  <span className="text-xs">Loading price…</span>
                </div>
              )}
            </div>
          )}

          {market.resolved ? (
            <RedeemPanel market={market} walletState={walletState} userYesBalance={userYes} userNoBalance={userNo} onComplete={refresh} />
          ) : (
            <TradePanel
              marketAddress={marketAddress}
              collateralAddress={market.collateralTokenAddress}
              collateralSymbol={market.collateralSymbol}
              walletState={walletState}
              yesPrice={market.yesPrice}
              noPrice={market.noPrice}
              depegThreshold={depegThreshold}
              onTxComplete={refresh}
            />
          )}
          <a
            href={`https://testnet.arcscan.app/address/${marketAddress}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-1.5 rounded-xl border border-[rgba(116,91,255,0.12)] bg-white/50 px-4 py-3 text-xs font-semibold text-slate-400 hover:text-[#745BFF] transition-colors"
          >
            <span className="material-symbols-outlined text-[14px]">open_in_new</span>
            View on ArcScan
          </a>
        </div>
      </div>
    </div>
  );
}
