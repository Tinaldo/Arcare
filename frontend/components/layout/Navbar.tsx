"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandLogo } from "@/components/layout/BrandLogo";
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
  )?.[1] ?? "Arcare";

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between border-b border-[rgba(116,91,255,0.12)] bg-white/60 backdrop-blur-xl px-6 py-4 lg:px-10">
      {/* Mobile logo (hidden on lg where sidebar shows) */}
      <div className="flex items-center gap-3">
        <BrandLogo compact className="lg:hidden" />
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
