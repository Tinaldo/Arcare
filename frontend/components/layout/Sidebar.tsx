"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWallet } from "@/components/wallet/WalletContext";

const NAV = [
  { href: "/", icon: "storefront", label: "Markets" },
  { href: "/portfolio", icon: "account_balance_wallet", label: "Portfolio" },
  { href: "/admin", icon: "admin_panel_settings", label: "Admin", adminOnly: true },
];

export function Sidebar() {
  const pathname = usePathname();
  const { isConnected } = useWallet();

  return (
    <aside className="hidden lg:flex w-60 flex-col shrink-0 border-r border-[rgba(116,91,255,0.12)] bg-white/40 backdrop-blur-2xl px-4 py-6 sticky top-0 h-screen">
      {/* Logo */}
      <Link href="/" className="mb-8 flex items-center gap-3 px-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#745BFF] to-[#5b3ee5] text-sm font-bold text-white shadow-lg shadow-[#745BFF]/30">
          AC
        </div>
        <div>
          <div className="text-base font-bold tracking-tight text-slate-900">ArCare</div>
          <div className="text-xs text-[#745BFF] font-medium">Testnet</div>
        </div>
      </Link>

      {/* Nav label */}
      <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
        Navigation
      </p>

      {/* Nav links */}
      <nav className="flex flex-col gap-1">
        {NAV.map((item) => {
          if (item.adminOnly && !isConnected) return null;
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all ${
                active
                  ? "bg-[#745BFF] text-white shadow-md shadow-[#745BFF]/30"
                  : "text-slate-600 hover:bg-[rgba(116,91,255,0.08)] hover:text-[#745BFF]"
              }`}
            >
              <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Bottom badge */}
      <div className="mt-auto px-2">
        <div className="rounded-xl bg-gradient-to-br from-[#745BFF]/10 to-[#5b3ee5]/10 border border-[rgba(116,91,255,0.15)] p-3">
          <p className="text-xs font-bold text-[#745BFF]">Arc Testnet</p>
          <p className="mt-0.5 text-[11px] text-slate-500">All transactions are on testnet.</p>
        </div>
      </div>
    </aside>
  );
}
