export type Category = "DEPEG" | "HACK" | "ALL";

export interface MarketOnChain {
  address: string;
  question: string;
  category: string;
  deadline: bigint;
  resolved: boolean;
  yesWins: boolean;
  yesReserve: bigint;
  noReserve: bigint;
  totalCollateral: bigint;
  yesPrice: bigint;  // 1e18 scaled
  noPrice: bigint;   // 1e18 scaled
}

export interface Wallet {
  id: string;
  address: string;
  blockchain: string;
}

export interface TokenBalance {
  token: { symbol: string; name: string; decimals: number };
  amount: string;
}

export type Outcome = "YES" | "NO";
export type TradeAction = "BUY" | "SELL";
