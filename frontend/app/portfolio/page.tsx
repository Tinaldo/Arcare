"use client";

import Link from "next/link";

export default function PortfolioPage() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
      <span className="material-symbols-outlined text-[56px] text-[#745BFF] opacity-60">account_balance_wallet</span>
      <h1 className="text-2xl font-extrabold text-slate-900">Portfolio</h1>
      <p className="max-w-sm text-slate-500">
        Your positions and history will appear here. Connect your wallet and trade on a market to get started.
      </p>
      <Link href="/" className="arc-btn-primary mt-2 px-6 py-2.5 text-sm">
        Browse Markets
      </Link>
    </div>
  );
}
