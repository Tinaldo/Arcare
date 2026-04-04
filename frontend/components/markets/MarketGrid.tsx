"use client";

import { useState } from "react";
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

  const filtered =
    filter === "ALL" ? markets : markets.filter((m) => m.category === filter);

  return (
    <div>
      {/* Filter pills + count */}
      <div className="mb-6 flex items-center gap-2">
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
        <span className="ml-auto text-sm font-medium text-slate-400">
          {filtered.length} market{filtered.length !== 1 ? "s" : ""}
        </span>
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
