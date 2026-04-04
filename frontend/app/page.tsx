"use client";

import { useEffect, useState } from "react";
import { MarketGrid } from "@/components/markets/MarketGrid";
import { Spinner } from "@/components/ui/Spinner";
import { arcClient } from "@/lib/arc-client";
import { MARKET_FACTORY_ABI, PREDICTION_MARKET_ABI } from "@/lib/abis";
import { MARKET_FACTORY_ADDRESS } from "@/lib/addresses";
import type { MarketOnChain } from "@/lib/types";

async function fetchMarkets(): Promise<MarketOnChain[]> {
  if (MARKET_FACTORY_ADDRESS === "0x0") return [];

  const count = await arcClient.readContract({
    address: MARKET_FACTORY_ADDRESS,
    abi: MARKET_FACTORY_ABI,
    functionName: "getMarketCount",
  });

  if (count === 0n) return [];

  const addresses = (await arcClient.readContract({
    address: MARKET_FACTORY_ADDRESS,
    abi: MARKET_FACTORY_ABI,
    functionName: "getMarkets",
    args: [0n, count],
  })) as `0x${string}`[];

  const markets = await Promise.all(
    addresses.map(async (addr) => {
      const info = await arcClient.readContract({
        address: addr,
        abi: PREDICTION_MARKET_ABI,
        functionName: "getMarketInfo",
      });
      const [question, category, deadline, resolved, yesWins, yesReserve, noReserve, totalCollateral, yesPrice, noPrice] =
        info as [string, string, bigint, boolean, boolean, bigint, bigint, bigint, bigint, bigint];
      return {
        address: addr,
        question,
        category,
        deadline,
        resolved,
        yesWins,
        yesReserve,
        noReserve,
        totalCollateral,
        yesPrice,
        noPrice,
      } satisfies MarketOnChain;
    })
  );

  return markets;
}

export default function HomePage() {
  const [markets, setMarkets] = useState<MarketOnChain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMarkets()
      .then(setMarkets)
      .catch((e) => setError(e.message ?? "Failed to load markets"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      {/* Hero */}
      <div className="mb-10 text-center">
        <h1 className="mb-3 text-4xl font-bold tracking-tight text-slate-900">
          Protect Against{" "}
          <span className="bg-gradient-to-r from-arc-blue to-arc-purple bg-clip-text text-transparent">
            Crypto Incidents
          </span>
        </h1>
        <p className="mx-auto max-w-xl text-slate-500">
          Prediction markets for stablecoin depegs and protocol hacks on Arc Testnet.
          Trade YES/NO outcomes, provide liquidity, and earn on your knowledge.
        </p>
      </div>

      {/* Stats bar */}
      <div className="mb-8 grid grid-cols-3 divide-x divide-arc-border rounded-2xl border border-arc-border bg-arc-card">
        {[
          { label: "Markets", value: markets.length },
          { label: "Active", value: markets.filter((m) => !m.resolved).length },
          { label: "Chain", value: "Arc Testnet" },
        ].map((s) => (
          <div key={s.label} className="px-6 py-4 text-center">
            <div className="text-xl font-bold text-slate-900">{s.value}</div>
            <div className="text-xs text-slate-400">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Market list */}
      {loading ? (
        <div className="flex justify-center py-20">
          <Spinner size={32} />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-8 text-center text-red-400">
          {MARKET_FACTORY_ADDRESS === "0x0"
            ? "Deploy contracts first: set NEXT_PUBLIC_MARKET_FACTORY_ADDRESS in .env.local"
            : error}
        </div>
      ) : (
        <MarketGrid markets={markets} />
      )}
    </div>
  );
}
