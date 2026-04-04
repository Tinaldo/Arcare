import { arcClient } from "@/lib/arc-client";
import { MARKET_FACTORY_ABI, PREDICTION_MARKET_ABI } from "@/lib/abis";
import {
  getCollateralByTokenAddress,
  getMarketCollaterals,
  type CollateralConfig,
} from "@/lib/collaterals";
import type { MarketOnChain } from "@/lib/types";

export interface ManagedMarket {
  address: `0x${string}`;
  question: string;
  category: string;
  resolutionDeadline: bigint;
  priceFeed: `0x${string}`;
  collateralSymbol: string;
  factoryAddress: `0x${string}`;
  resolverAddress: `0x${string}`;
  pairKey: string;
}

function normalizeQuestion(question: string) {
  return question.trim().toLowerCase().replace(/\s+/g, " ");
}

export function createMarketPairKey(question: string, category: string, deadline: bigint) {
  return `${category}:${deadline.toString()}:${normalizeQuestion(question)}`;
}

function sortMarkets(markets: MarketOnChain[]) {
  return [...markets].sort((left, right) => {
    if (left.resolved !== right.resolved) return left.resolved ? 1 : -1;
    if (left.deadline !== right.deadline) return Number(left.deadline - right.deadline);
    return left.collateralSymbol.localeCompare(right.collateralSymbol);
  });
}

function toMarket(
  address: `0x${string}`,
  collateral: CollateralConfig,
  info: [string, string, bigint, boolean, boolean, bigint, bigint, bigint, bigint, bigint]
): MarketOnChain {
  const [
    question,
    category,
    deadline,
    resolved,
    yesWins,
    yesReserve,
    noReserve,
    totalCollateral,
    yesPrice,
    noPrice,
  ] = info;

  return {
    address,
    question,
    category,
    deadline,
    resolved,
    yesWins,
    yesReserve,
    noReserve,
    totalCollateral,
    yesPrice,
    noPrice,
    collateralSymbol: collateral.symbol,
    collateralTokenAddress: collateral.tokenAddress,
    factoryAddress: collateral.factoryAddress,
    resolverAddress: collateral.resolverAddress,
    pairKey: createMarketPairKey(question, category, deadline),
  };
}

async function loadMarketsForCollateral(collateral: CollateralConfig): Promise<MarketOnChain[]> {
  const count = (await arcClient.readContract({
    address: collateral.factoryAddress,
    abi: MARKET_FACTORY_ABI,
    functionName: "getMarketCount",
  })) as bigint;

  if (count === 0n) return [];

  const addresses = (await arcClient.readContract({
    address: collateral.factoryAddress,
    abi: MARKET_FACTORY_ABI,
    functionName: "getMarkets",
    args: [0n, count],
  })) as `0x${string}`[];

  return Promise.all(
    addresses.map(async (address) => {
      const info = (await arcClient.readContract({
        address,
        abi: PREDICTION_MARKET_ABI,
        functionName: "getMarketInfo",
      })) as [string, string, bigint, boolean, boolean, bigint, bigint, bigint, bigint, bigint];

      return toMarket(address, collateral, info);
    })
  );
}

export async function loadAllMarkets() {
  const batches = await Promise.all(getMarketCollaterals().map(loadMarketsForCollateral));
  return sortMarkets(batches.flat());
}

export async function loadMarketByAddress(address: `0x${string}`): Promise<MarketOnChain | null> {
  const [info, tokenAddress] = await Promise.all([
    arcClient.readContract({
      address,
      abi: PREDICTION_MARKET_ABI,
      functionName: "getMarketInfo",
    }) as Promise<[string, string, bigint, boolean, boolean, bigint, bigint, bigint, bigint, bigint]>,
    arcClient.readContract({
      address,
      abi: PREDICTION_MARKET_ABI,
      functionName: "usdc",
    }) as Promise<`0x${string}`>,
  ]);

  const collateral =
    getCollateralByTokenAddress(tokenAddress) ??
    ({
      symbol: "USDC",
      name: "Stablecoin",
      tokenAddress,
      factoryAddress: "0x0",
      resolverAddress: "0x0",
      accent: "#745BFF",
      accentSoft: "rgba(116, 91, 255, 0.14)",
      glyph: "¤",
    } satisfies CollateralConfig);

  return toMarket(address, collateral, info);
}

export async function loadManagedMarkets(): Promise<ManagedMarket[]> {
  const batches = await Promise.all(
    getMarketCollaterals().map(async (collateral) => {
      const count = (await arcClient.readContract({
        address: collateral.factoryAddress,
        abi: MARKET_FACTORY_ABI,
        functionName: "getMarketCount",
      })) as bigint;

      if (count === 0n) return [];

      const addresses = (await arcClient.readContract({
        address: collateral.factoryAddress,
        abi: MARKET_FACTORY_ABI,
        functionName: "getMarkets",
        args: [0n, count],
      })) as `0x${string}`[];

      return Promise.all(
        addresses.map(async (address) => {
          const info = (await arcClient.readContract({
            address: collateral.factoryAddress,
            abi: MARKET_FACTORY_ABI,
            functionName: "getMarketInfo",
            args: [address],
          })) as {
            question: string;
            category: string;
            createdAt: bigint;
            resolutionDeadline: bigint;
            priceFeed: `0x${string}`;
          };

          return {
            address,
            question: info.question,
            category: info.category,
            resolutionDeadline: info.resolutionDeadline,
            priceFeed: info.priceFeed,
            collateralSymbol: collateral.symbol,
            factoryAddress: collateral.factoryAddress,
            resolverAddress: collateral.resolverAddress,
            pairKey: createMarketPairKey(info.question, info.category, info.resolutionDeadline),
          } satisfies ManagedMarket;
        })
      );
    })
  );

  return batches
    .flat()
    .sort((left, right) => Number(left.resolutionDeadline - right.resolutionDeadline));
}

export async function detectCollateralForMarket(address: `0x${string}`) {
  const tokenAddress = (await arcClient.readContract({
    address,
    abi: PREDICTION_MARKET_ABI,
    functionName: "usdc",
  })) as `0x${string}`;

  return getCollateralByTokenAddress(tokenAddress) ?? null;
}
