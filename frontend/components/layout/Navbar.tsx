"use client";

import Link from "next/link";
import { WalletButton } from "@/components/wallet/WalletButton";
import type { CircleWalletState } from "@/components/wallet/useCircleWallet";

interface Props {
  walletState: CircleWalletState;
}

export function Navbar({ walletState }: Props) {
  return (
    <nav className="sticky top-0 z-40 border-b border-arc-border bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-arc-blue to-arc-purple text-sm font-bold text-white">
            IA
          </div>
          <span className="text-lg font-bold tracking-tight text-slate-900">InsurArc</span>
          <span className="hidden rounded-full bg-arc-blue/10 px-2 py-0.5 text-xs text-arc-blue sm:block">
            Testnet
          </span>
        </Link>

        {/* Links */}
        <div className="hidden items-center gap-6 sm:flex">
          <Link href="/" className="text-sm text-slate-500 hover:text-slate-900 transition-colors">
            Markets
          </Link>
        </div>

        {/* Wallet */}
        <WalletButton walletState={walletState} />
      </div>
    </nav>
  );
}
