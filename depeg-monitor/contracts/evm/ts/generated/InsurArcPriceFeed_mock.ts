// Code generated — DO NOT EDIT.
import type { Address } from 'viem'
import { addContractMock, type ContractMock, type EvmMock } from '@chainlink/cre-sdk/test'

import { InsurArcPriceFeedABI } from './InsurArcPriceFeed'

export type InsurArcPriceFeedMock = {
  latestPrice?: (marketId: bigint) => { price: bigint; updatedAt: bigint }
} & Pick<ContractMock<typeof InsurArcPriceFeedABI>, 'writeReport'>

export function newInsurArcPriceFeedMock(address: Address, evmMock: EvmMock): InsurArcPriceFeedMock {
  return addContractMock(evmMock, { address, abi: InsurArcPriceFeedABI }) as InsurArcPriceFeedMock
}
