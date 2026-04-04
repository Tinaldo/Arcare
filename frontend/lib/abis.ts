export const MARKET_FACTORY_ABI = [
  {
    type: "constructor",
    inputs: [{ name: "_usdc", type: "address" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "createMarket",
    inputs: [
      { name: "question", type: "string" },
      { name: "category", type: "string" },
      { name: "resolutionDeadline", type: "uint256" },
      { name: "initialLiquidityUsdc", type: "uint256" },
    ],
    outputs: [{ name: "market", type: "address" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getMarketCount",
    inputs: [],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getMarkets",
    inputs: [
      { name: "offset", type: "uint256" },
      { name: "limit", type: "uint256" },
    ],
    outputs: [{ name: "markets", type: "address[]" }],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "MarketCreated",
    inputs: [
      { name: "market", type: "address", indexed: true },
      { name: "question", type: "string", indexed: false },
      { name: "category", type: "string", indexed: false },
      { name: "resolutionDeadline", type: "uint256", indexed: false },
      { name: "creator", type: "address", indexed: true },
    ],
  },
] as const;

export const PREDICTION_MARKET_ABI = [
  {
    type: "function",
    name: "getMarketInfo",
    inputs: [],
    outputs: [
      { name: "_question", type: "string" },
      { name: "_category", type: "string" },
      { name: "_deadline", type: "uint256" },
      { name: "_resolved", type: "bool" },
      { name: "_yesWins", type: "bool" },
      { name: "_yesReserve", type: "uint256" },
      { name: "_noReserve", type: "uint256" },
      { name: "_totalCollateral", type: "uint256" },
      { name: "_yesPrice", type: "uint256" },
      { name: "_noPrice", type: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "calcBuy",
    inputs: [
      { name: "isYes", type: "bool" },
      { name: "usdcIn", type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "calcSell",
    inputs: [
      { name: "isYes", type: "bool" },
      { name: "tokensIn", type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getPrice",
    inputs: [{ name: "isYes", type: "bool" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "yesBalances",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "noBalances",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "lpShares",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "owner",
    inputs: [],
    outputs: [{ type: "address" }],
    stateMutability: "view",
  },
] as const;

export const ERC20_ABI = [
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "allowance",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
] as const;
