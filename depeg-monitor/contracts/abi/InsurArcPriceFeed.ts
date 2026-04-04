import { parseAbi } from 'viem'

export const InsurArcPriceFeedAbi = parseAbi([
  // Called by the CRE DON — receives encoded (marketId, price) payload
  'function onReport(bytes calldata metadata, bytes calldata report) external',
  // View: latest price stored for a market (8-decimal fixed-point)
  'function latestPrice(uint256 marketId) view returns (uint256 price, uint256 updatedAt)',
])
