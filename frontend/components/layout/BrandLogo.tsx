"use client";

import Image from "next/image";
import Link from "next/link";

type BrandLogoProps = {
  compact?: boolean;
  className?: string;
};

export function BrandLogo({ compact = false, className = "" }: BrandLogoProps) {
  return (
    <Link href="/" className={`flex items-center gap-3 ${className}`.trim()}>
      <div className="flex h-11 w-11 items-center justify-center">
        <Image
          src="/branding/logo/logo.png"
          alt="Arcare logo"
          width={52}
          height={52}
          className="h-full w-full object-contain drop-shadow-[0_8px_20px_rgba(116,91,255,0.18)]"
          priority
        />
      </div>
      {!compact && (
        <div>
          <div className="text-base font-bold tracking-tight text-slate-900">Arcare</div>
          <div className="text-xs font-medium text-[#745BFF]">Testnet</div>
        </div>
      )}
      {compact && <span className="font-bold text-slate-900">Arcare</span>}
    </Link>
  );
}
