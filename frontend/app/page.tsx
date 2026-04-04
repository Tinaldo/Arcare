"use client";

import { useEffect, useState } from "react";
import { MarketGrid } from "@/components/markets/MarketGrid";
import { Spinner } from "@/components/ui/Spinner";
import { getMarketCollaterals } from "@/lib/collaterals";
import { loadAllMarkets } from "@/lib/markets";
import type { MarketOnChain } from "@/lib/types";

export default function HomePage() {
  const [markets, setMarkets] = useState<MarketOnChain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasConfiguredMarkets = getMarketCollaterals().length > 0;

  useEffect(() => {
    loadAllMarkets()
      .then(setMarkets)
      .catch((e) => setError(e.message ?? "Failed to load markets"))
      .finally(() => setLoading(false));
  }, []);

  const active = markets.filter((m) => !m.resolved).length;
  const resolved = markets.filter((m) => m.resolved).length;

  return (
    <div>
      {/* Hero gradient banner */}
      <div className="relative mb-8 overflow-hidden rounded-2xl bg-gradient-to-br from-[#5b3ee5] to-[#745BFF] px-8 py-10 text-white shadow-xl shadow-[#745BFF]/20">
        {/* Background decoration */}
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-10 right-24 h-40 w-40 rounded-full bg-white/5" />

        <div className="relative">
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-bold uppercase tracking-widest">
            <span className="material-symbols-outlined text-[14px]">verified_user</span>
            Arc Testnet
          </div>
          <h1 className="mb-3 text-3xl font-extrabold leading-tight">
            Crypto Incident<br />Prediction Markets
          </h1>
          <p className="max-w-md text-sm text-white/80 leading-relaxed">
            Trade YES/NO outcomes on stablecoin depegs and protocol hacks.
            Earn on your knowledge with on-chain AMM pricing.
          </p>
        </div>
      </div>

      {/* Stats bento */}
      <div className="mb-8 grid grid-cols-3 gap-4">
        {[
          { icon: "bar_chart", label: "Total Markets", value: markets.length, color: "#745BFF" },
          { icon: "trending_up", label: "Active", value: active, color: "#00C96E" },
          { icon: "check_circle", label: "Resolved", value: resolved, color: "#FF4D6A" },
        ].map((s) => (
          <div key={s.label} className="glass-card px-5 py-4">
            <div className="mb-1 flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]" style={{ color: s.color }}>
                {s.icon}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                {s.label}
              </span>
            </div>
            <div className="text-2xl font-extrabold text-slate-900">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Market list */}
      {loading ? (
        <div className="flex justify-center py-20">
          <Spinner size={32} />
        </div>
      ) : error ? (
        <div className="glass-card p-8 text-center text-red-500">
          {!hasConfiguredMarkets
            ? "Deploy contracts first: set the USDC and EURC market factory addresses in frontend/.env.local"
            : error}
        </div>
      ) : (
        <MarketGrid markets={markets} />
      )}
    </div>
  );
}
