import Link from "next/link";
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

function riskScore(yesPrice: bigint): { label: string; color: string } {
  const p = Number(yesPrice) / 1e18;
  if (p >= 0.7) return { label: "High Risk", color: "#FF4D6A" };
  if (p >= 0.4) return { label: "Med Risk", color: "#F59E0B" };
  return { label: "Low Risk", color: "#00C96E" };
}

export function MarketCard({ market }: Props) {
  const yesPct = Math.round((Number(market.yesPrice) / 1e18) * 100);
  const risk = riskScore(market.yesPrice);
  const isHack = market.category === "HACK";

  return (
    <Link href={`/markets/${market.address}`} className="block">
      <div className="group relative overflow-hidden rounded-2xl border border-[rgba(116,91,255,0.12)] bg-white/65 backdrop-blur-xl p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg hover:shadow-[#745BFF]/15">
        {/* Top gradient strip */}
        <div
          className="absolute inset-x-0 top-0 h-0.5 rounded-t-2xl"
          style={{
            background: isHack
              ? "linear-gradient(90deg, #FF4D6A, #f97316)"
              : "linear-gradient(90deg, #745BFF, #5b3ee5)",
          }}
        />

        {/* Header row */}
        <div className="mb-3 flex items-center justify-between">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest ${
              isHack
                ? "bg-red-500/10 text-red-500"
                : "bg-[#745BFF]/10 text-[#745BFF]"
            }`}
          >
            <span className="material-symbols-outlined text-[12px]">
              {isHack ? "bug_report" : "currency_exchange"}
            </span>
            {market.category}
          </span>

          <div className="flex items-center gap-1.5">
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-bold"
              style={{ color: risk.color, background: `${risk.color}18` }}
            >
              {risk.label}
            </span>
            {market.resolved && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                Resolved
              </span>
            )}
          </div>
        </div>

        {/* Question */}
        <p className="mb-4 line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-snug text-slate-800">
          {market.question}
        </p>

        {/* YES probability big display */}
        <div className="mb-3 flex items-baseline gap-2">
          <span className="text-3xl font-extrabold text-[#745BFF]">{yesPct}%</span>
          <span className="text-xs text-slate-400 font-medium">chance YES</span>
        </div>

        {/* Probability bar */}
        <ProbabilityBar yesPrice={market.yesPrice} noPrice={market.noPrice} />

        {/* Footer */}
        <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
          <span className="flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">water_drop</span>
            {formatUsdc(market.totalCollateral)} USDC
          </span>
          <span className="flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">schedule</span>
            {timeLeft(market.deadline)}
          </span>
        </div>
      </div>
    </Link>
  );
}
