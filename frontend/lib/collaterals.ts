import {
  ARC_EURC_ADDRESS,
  ARC_USDC_ADDRESS,
  DEPEG_RESOLVER_ADDRESS,
  EURC_DEPEG_RESOLVER_ADDRESS,
  EURC_MARKET_FACTORY_ADDRESS,
  MARKET_FACTORY_ADDRESS,
} from "@/lib/addresses";

export type CollateralSymbol = "USDC" | "EURC";

export interface CollateralConfig {
  symbol: CollateralSymbol;
  name: string;
  tokenAddress: `0x${string}`;
  factoryAddress: `0x${string}`;
  resolverAddress: `0x${string}`;
  accent: string;
  accentSoft: string;
  glyph: string;
}

export const COLLATERALS: CollateralConfig[] = [
  {
    symbol: "USDC",
    name: "USD Coin",
    tokenAddress: ARC_USDC_ADDRESS,
    factoryAddress: MARKET_FACTORY_ADDRESS,
    resolverAddress: DEPEG_RESOLVER_ADDRESS,
    accent: "#2775CA",
    accentSoft: "rgba(39, 117, 202, 0.14)",
    glyph: "$",
  },
  {
    symbol: "EURC",
    name: "Euro Coin",
    tokenAddress: ARC_EURC_ADDRESS,
    factoryAddress: EURC_MARKET_FACTORY_ADDRESS,
    resolverAddress: EURC_DEPEG_RESOLVER_ADDRESS,
    accent: "#0EA5A4",
    accentSoft: "rgba(14, 165, 164, 0.14)",
    glyph: "€",
  },
];

export function isConfiguredAddress(address: string | undefined | null): address is `0x${string}` {
  return Boolean(address && /^0x[a-fA-F0-9]{40}$/.test(address));
}

export function getBalanceCollaterals() {
  return COLLATERALS.filter((collateral) => isConfiguredAddress(collateral.tokenAddress));
}

export function getMarketCollaterals() {
  return COLLATERALS.filter(
    (collateral) =>
      isConfiguredAddress(collateral.tokenAddress) &&
      isConfiguredAddress(collateral.factoryAddress) &&
      isConfiguredAddress(collateral.resolverAddress)
  );
}

export function getCollateralBySymbol(symbol: string) {
  return COLLATERALS.find((collateral) => collateral.symbol === symbol.toUpperCase());
}

export function getCollateralByTokenAddress(tokenAddress: string) {
  return COLLATERALS.find(
    (collateral) => collateral.tokenAddress.toLowerCase() === tokenAddress.toLowerCase()
  );
}

export function getCollateralByFactoryAddress(factoryAddress: string) {
  return COLLATERALS.find(
    (collateral) => collateral.factoryAddress.toLowerCase() === factoryAddress.toLowerCase()
  );
}
