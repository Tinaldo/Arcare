export const MARKET_FACTORY_ABI = [
  {
    type: "constructor",
    inputs: [
      { name: "_usdc", type: "address" },
      { name: "_priceRouter", type: "address" },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "MARKET_CREATOR_ROLE",
    inputs: [],
    outputs: [{ type: "bytes32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "DEFAULT_ADMIN_ROLE",
    inputs: [],
    outputs: [{ type: "bytes32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "hasRole",
    inputs: [
      { name: "role", type: "bytes32" },
      { name: "account", type: "address" },
    ],
    outputs: [{ type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "grantMarketCreator",
    inputs: [{ name: "user", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "revokeMarketCreator",
    inputs: [{ name: "user", type: "address" }],
    outputs: [],
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
      { name: "priceFeed", type: "address" },
    ],
    outputs: [{ name: "market", type: "address" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "priceRouter",
    inputs: [],
    outputs: [{ type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "setPriceRouter",
    inputs: [{ name: "newRouter", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "removeMarket",
    inputs: [{ name: "market", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "deleteMarket",
    inputs: [{ name: "market", type: "address" }],
    outputs: [],
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
    type: "function",
    name: "getMarketInfo",
    inputs: [{ name: "market", type: "address" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "question", type: "string" },
          { name: "category", type: "string" },
          { name: "createdAt", type: "uint256" },
          { name: "resolutionDeadline", type: "uint256" },
          { name: "priceFeed", type: "address" },
        ],
      },
    ],
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
      { name: "priceFeed", type: "address", indexed: true },
      { name: "creator", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "MarketDeleted",
    inputs: [
      { name: "market", type: "address", indexed: true },
      { name: "deletedBy", type: "address", indexed: true },
      { name: "usdcRefunded", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "MarketRemoved",
    inputs: [
      { name: "market", type: "address", indexed: true },
      { name: "removedBy", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "RouterUpdated",
    inputs: [
      { name: "oldRouter", type: "address", indexed: true },
      { name: "newRouter", type: "address", indexed: true },
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
