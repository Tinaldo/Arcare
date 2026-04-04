"use client";

import { getCollateralBySymbol } from "@/lib/collaterals";

interface Props {
  symbol: string;
  size?: number;
}

export function TokenLogo({ symbol, size = 18 }: Props) {
  const collateral = getCollateralBySymbol(symbol);
  const glyph = collateral?.glyph ?? symbol.slice(0, 1).toUpperCase();
  const accent = collateral?.accent ?? "#745BFF";
  const accentSoft = collateral?.accentSoft ?? "rgba(116, 91, 255, 0.14)";

  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full border border-white/70 font-black text-white shadow-sm"
      style={{
        width: size,
        height: size,
        fontSize: Math.max(10, Math.floor(size * 0.52)),
        background: `radial-gradient(circle at 30% 30%, ${accent}, ${accent}CC 55%, ${accentSoft})`,
        boxShadow: `0 8px 16px -10px ${accent}`,
      }}
      aria-hidden="true"
    >
      {glyph}
    </span>
  );
}
