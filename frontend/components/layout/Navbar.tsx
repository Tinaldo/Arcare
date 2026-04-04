"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletButton } from "@/components/wallet/WalletButton";
import { useWallet } from "@/components/wallet/WalletContext";

const PAGE_TITLES: Record<string, string> = {
  "/": "Markets",
  "/portfolio": "Portfolio",
  "/admin": "Admin",
};

export function Navbar() {
  const { isConnected } = useWallet();
  const pathname = usePathname();

  const title = Object.entries(PAGE_TITLES).find(([path]) =>
    pathname === path || (path !== "/" && pathname.startsWith(path))
  )?.[1] ?? "ArCare";

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between border-b border-[rgba(116,91,255,0.12)] bg-white/60 backdrop-blur-xl px-6 py-4 lg:px-10">
      {/* Mobile logo (hidden on lg where sidebar shows) */}
      <div className="flex items-center gap-3">
        <Link href="/" className="flex items-center gap-2 lg:hidden">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#745BFF] to-[#5b3ee5] text-sm font-bold text-white">
            AC
          </div>
          <span className="font-bold text-slate-900">ArCare</span>
        </Link>
        <h1 className="hidden text-xl font-bold text-slate-900 lg:block">{title}</h1>
      </div>

      {/* Mobile nav */}
      <nav className="flex items-center gap-1 lg:hidden">
        <Link href="/" className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-[rgba(116,91,255,0.08)] hover:text-[#745BFF]">
          Markets
        </Link>
        {isConnected && (
          <Link href="/admin" className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-[rgba(116,91,255,0.08)] hover:text-[#745BFF]">
            Admin
          </Link>
        )}
      </nav>

      <WalletButton />
    </header>
  );
}
