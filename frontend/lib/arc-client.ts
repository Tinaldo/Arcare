import { createPublicClient, http, defineChain } from "viem";

// Arc Testnet — Circle's EVM chain where USDC is the native gas token.
// Chain ID sourced from Circle documentation.
export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: {
    name: "USD Coin",
    symbol: "USDC",
    decimals: 6,
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
  return (Number(amount) / 1e6).toFixed(decimals);
}

// Utility: parse human-readable USDC string to bigint (6 decimals)
export function parseUsdc(amount: string): bigint {
  const n = parseFloat(amount);
  if (isNaN(n) || n < 0) return 0n;
  return BigInt(Math.round(n * 1e6));
}
