"use client";

import { useState } from "react";
import { TokenLogo } from "@/components/tokens/TokenLogo";
import { MarketCard } from "./MarketCard";
import type { MarketOnChain, Category } from "@/lib/types";

interface Props {
  markets: MarketOnChain[];
}

const TABS: { label: string; value: Category | "ALL"; icon: string }[] = [
  { label: "All", value: "ALL", icon: "apps" },
  { label: "Depeg", value: "DEPEG", icon: "currency_exchange" },
  { label: "Hack", value: "HACK", icon: "bug_report" },
];

export function MarketGrid({ markets }: Props) {
  const [filter, setFilter] = useState<Category | "ALL">("ALL");
  const [currency, setCurrency] = useState<string>("ALL");

  const currencies = Array.from(new Set(markets.map((market) => market.collateralSymbol)));
  const showCurrencyFilter = currencies.length > 1;

  const filtered = markets.filter((market) => {
    const categoryMatches = filter === "ALL" || market.category === filter;
    const currencyMatches = currency === "ALL" || market.collateralSymbol === currency;
    return categoryMatches && currencyMatches;
  });

  return (
    <div>
      {/* Filter pills + count */}
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setFilter(tab.value)}
              className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold transition-all ${
                filter === tab.value
                  ? "bg-[#745BFF] text-white shadow-md shadow-[#745BFF]/30"
                  : "bg-white/60 text-slate-500 hover:bg-white hover:text-[#745BFF] border border-[rgba(116,91,255,0.12)]"
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          {showCurrencyFilter && (
            <div className="flex items-center gap-1 rounded-full border border-[rgba(116,91,255,0.12)] bg-white/70 p-1">
              <button
                onClick={() => setCurrency("ALL")}
                className={`rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-widest transition-all ${
                  currency === "ALL" ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-900"
                }`}
              >
                All
              </button>
              {currencies.map((symbol) => (
                <button
                  key={symbol}
                  onClick={() => setCurrency(symbol)}
                  className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-widest transition-all ${
                    currency === symbol
                      ? "bg-slate-900 text-white"
                      : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  <TokenLogo symbol={symbol} size={16} />
                  {symbol}
                </button>
              ))}
            </div>
          )}
          <span className="text-sm font-medium text-slate-400">
            {filtered.length} market{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="glass-card flex flex-col items-center gap-3 py-20 text-center">
          <span className="material-symbols-outlined text-[48px] text-slate-300">storefront</span>
          <p className="text-slate-400 font-medium">No markets yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((m) => (
            <MarketCard key={m.address} market={m} />
          ))}
        </div>
      )}
    </div>
  );
}
