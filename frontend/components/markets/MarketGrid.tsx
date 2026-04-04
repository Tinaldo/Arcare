"use client";

import { useState } from "react";
import { MarketCard } from "./MarketCard";
import type { MarketOnChain, Category } from "@/lib/types";

interface Props {
  markets: MarketOnChain[];
}

const TABS: { label: string; value: Category | "ALL" }[] = [
  { label: "All", value: "ALL" },
  { label: "Depeg", value: "DEPEG" },
  { label: "Hack", value: "HACK" },
];

export function MarketGrid({ markets }: Props) {
  const [filter, setFilter] = useState<Category | "ALL">("ALL");

  const filtered =
    filter === "ALL" ? markets : markets.filter((m) => m.category === filter);

  return (
    <div>
      {/* Filter tabs */}
      <div className="mb-6 flex gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setFilter(tab.value)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              filter === tab.value
                ? "bg-arc-blue text-white"
                : "text-gray-400 hover:bg-white/10 hover:text-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
        <span className="ml-auto self-center text-sm text-gray-500">
          {filtered.length} market{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-arc-border bg-arc-card py-20 text-center text-gray-500">
          No markets yet.
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
