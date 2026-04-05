"use client";

import { useEffect, useState } from "react";
import { MarketGrid } from "@/components/markets/MarketGrid";
import { TokenLogo } from "@/components/tokens/TokenLogo";
import { Spinner } from "@/components/ui/Spinner";
import { getLoadableCollaterals } from "@/lib/collaterals";
import { loadAllMarkets } from "@/lib/markets";
import type { MarketOnChain } from "@/lib/types";

const CONFIGURED_COLLATERALS = getLoadableCollaterals();

export default function HomePage() {
  const [markets, setMarkets] = useState<MarketOnChain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAllMarkets()
      .then(setMarkets)
      .catch((e) => setError(e.message ?? "Failed to load markets"))
      .finally(() => setLoading(false));

    // Poll every 15s to pick up new markets and price updates
    const id = setInterval(() => {
      loadAllMarkets().then(setMarkets).catch(() => {});
    }, 15_000);
    return () => clearInterval(id);
  }, []);

  const active = markets.filter((m) => !m.resolved).length;
  const resolved = markets.filter((m) => m.resolved).length;

  // Per-collateral buckets (only collaterals that are configured)
  const collateralBuckets = CONFIGURED_COLLATERALS.map((c) => ({
    collateral: c,
    markets: markets.filter((m) => m.collateralSymbol === c.symbol),
  }));

  const multipleCollaterals = CONFIGURED_COLLATERALS.length > 1;

  return (
    <div>
      {/* Hero gradient banner */}
      <div className="relative mb-8 overflow-hidden rounded-2xl bg-gradient-to-br from-[#5b3ee5] to-[#745BFF] px-8 py-10 text-white shadow-xl shadow-[#745BFF]/20">
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
          {CONFIGURED_COLLATERALS.length === 0
            ? "Deploy contracts first: set the USDC and EURC market factory addresses in frontend/.env.local"
            : error}
        </div>
      ) : multipleCollaterals ? (
        /* Split view: one section per collateral */
        <div className="space-y-10">
          {collateralBuckets.map(({ collateral, markets: subset }) => (
            <section key={collateral.symbol}>
              <div className="mb-5 flex items-center gap-3 border-b border-[rgba(116,91,255,0.1)] pb-3">
                <TokenLogo symbol={collateral.symbol} size={28} />
                <div>
                  <h2 className="text-lg font-extrabold text-slate-900">{collateral.name} Markets</h2>
                  <p className="text-xs text-slate-400">
                    {subset.filter((m) => !m.resolved).length} active
                    {subset.filter((m) => m.resolved).length > 0 &&
                      ` · ${subset.filter((m) => m.resolved).length} resolved`}
                  </p>
                </div>
              </div>
              {subset.length === 0 ? (
                <div className="glass-card flex flex-col items-center gap-2 py-16 text-center">
                  <span className="material-symbols-outlined text-[40px] text-slate-200">storefront</span>
                  <p className="text-sm font-medium text-slate-400">No {collateral.symbol} markets yet.</p>
                  <p className="text-xs text-slate-300">Create one from the admin page.</p>
                </div>
              ) : (
                <MarketGrid markets={subset} />
              )}
            </section>
          ))}
        </div>
      ) : (
        /* Single collateral: flat grid */
        <MarketGrid markets={markets} />
      )}
    </div>
  );
}
