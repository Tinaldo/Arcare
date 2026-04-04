import { createPublicClient, http, defineChain, parseUnits } from "viem";

// Arc Testnet — Circle's EVM chain where USDC is the native gas token.
// Chain ID sourced from Circle documentation.
export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: {
    name: "USD Coin",
    symbol: "USDC",
    decimals: 18,
  },
  rpcUrls: {
    default: { http: ["https://rpc.testnet.arc.network"] },
  },
  blockExplorers: {
    default: {
      name: "ArcScan",
      url: "https://testnet.arcscan.app",
    },
  },
  testnet: true,
});

export const arcClient = createPublicClient({
  chain: arcTestnet,
  transport: http("https://rpc.testnet.arc.network"),
});

// Utility: format a 1e18-scaled price to a percentage string
export function formatPrice(price1e18: bigint): string {
  return ((Number(price1e18) / 1e18) * 100).toFixed(1);
}

// Utility: format USDC (6 decimals) to human-readable string
export function formatUsdc(amount: bigint, decimals = 2): string {
  return formatTokenAmount(amount, 6, decimals);
}

// Utility: parse human-readable USDC string to bigint (6 decimals)
export function parseUsdc(amount: string): bigint {
  const value = amount.trim();
  if (!value) return 0n;

  try {
    return parseUnits(value, 6);
  } catch {
    return 0n;
  }
}

export function formatTokenAmount(amount: bigint, tokenDecimals: number, displayDecimals = 2): string {
  const normalizedDisplayDecimals = Math.max(0, displayDecimals);
  const displayScale = 10n ** BigInt(normalizedDisplayDecimals);

  let rounded = amount;
  if (tokenDecimals > normalizedDisplayDecimals) {
    const divisor = 10n ** BigInt(tokenDecimals - normalizedDisplayDecimals);
    rounded = (amount + divisor / 2n) / divisor;
  } else if (tokenDecimals < normalizedDisplayDecimals) {
    rounded = amount * 10n ** BigInt(normalizedDisplayDecimals - tokenDecimals);
  }

  const integerPart = rounded / displayScale;
  const fractionPart = rounded % displayScale;
  const formattedInteger = integerPart.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  if (normalizedDisplayDecimals === 0) {
    return formattedInteger;
  }

  return `${formattedInteger}.${fractionPart.toString().padStart(normalizedDisplayDecimals, "0")}`;
}
