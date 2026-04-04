import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { ProbabilityBar } from "./ProbabilityBar";
import { formatUsdc } from "@/lib/arc-client";
import type { MarketOnChain } from "@/lib/types";

interface Props {
  market: MarketOnChain;
}

function timeLeft(deadline: bigint): string {
  const diff = Number(deadline) - Math.floor(Date.now() / 1000);
  if (diff <= 0) return "Expired";
  const days = Math.floor(diff / 86400);
  if (days > 0) return `${days}d left`;
  const hours = Math.floor(diff / 3600);
  return `${hours}h left`;
}

export function MarketCard({ market }: Props) {
  const catVariant = market.category === "DEPEG" ? "depeg" : "hack";
  const statusVariant = market.resolved ? "resolved" : "active";

  return (
    <Link href={`/markets/${market.address}`} className="block">
      <div className="group relative overflow-hidden rounded-2xl border border-arc-border bg-arc-card p-5 transition-all duration-200 hover:border-arc-blue/50 hover:shadow-lg hover:shadow-arc-blue/10">
        {/* Subtle gradient top */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-arc-blue/40 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

        {/* Header badges */}
        <div className="mb-3 flex items-center gap-2">
          <Badge label={market.category} variant={catVariant} />
          <Badge label={market.resolved ? "Resolved" : "Active"} variant={statusVariant} />
        </div>

        {/* Question */}
        <p className="mb-4 line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-snug text-slate-800">
          {market.question}
        </p>

        {/* Probability bar */}
        <ProbabilityBar yesPrice={market.yesPrice} noPrice={market.noPrice} />

        {/* Footer stats */}
        <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
          <span>{formatUsdc(market.totalCollateral)} USDC volume</span>
          <span>{timeLeft(market.deadline)}</span>
        </div>
      </div>
    </Link>
  );
}
