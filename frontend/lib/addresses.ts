export const MARKET_FACTORY_ADDRESS =
  (process.env.NEXT_PUBLIC_MARKET_FACTORY_ADDRESS || "0x0") as `0x${string}`;

export const DEPEG_RESOLVER_ADDRESS =
  (process.env.NEXT_PUBLIC_DEPEG_RESOLVER_ADDRESS || "0x0") as `0x${string}`;

export const ARC_USDC_ADDRESS =
  (process.env.NEXT_PUBLIC_ARC_USDC_ADDRESS as `0x${string}`) ??
  "0x3600000000000000000000000000000000000000";
