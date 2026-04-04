// Code generated — DO NOT EDIT.
import {
  decodeFunctionResult,
  encodeFunctionData,
  encodeAbiParameters,
  parseAbiParameters,
  zeroAddress,
} from 'viem'
import type { Address, Hex } from 'viem'
import {
  bytesToHex,
  encodeCallMsg,
  EVMClient,
  LAST_FINALIZED_BLOCK_NUMBER,
  prepareReportRequest,
  type Runtime,
} from '@chainlink/cre-sdk'

export const InsurArcPriceFeedABI = [
  {
    type: 'function',
    name: 'onReport',
    inputs: [
      { name: 'metadata', type: 'bytes', internalType: 'bytes' },
      { name: 'report',   type: 'bytes', internalType: 'bytes' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'latestPrice',
    inputs: [{ name: 'marketId', type: 'uint256', internalType: 'uint256' }],
    outputs: [
      { name: 'price',     type: 'uint256', internalType: 'uint256' },
      { name: 'updatedAt', type: 'uint256', internalType: 'uint256' },
    ],
    stateMutability: 'view',
  },
] as const

export class InsurArcPriceFeed {
  constructor(
    private readonly client: EVMClient,
    public readonly address: Address,
  ) {}

  // ── Read ────────────────────────────────────────────────────

  latestPrice(
    runtime: Runtime<unknown>,
    marketId: bigint,
  ): { price: bigint; updatedAt: bigint } {
    const callData = encodeFunctionData({
      abi: InsurArcPriceFeedABI,
      functionName: 'latestPrice' as const,
      args: [marketId],
    })

    const result = this.client
      .callContract(runtime, {
        call: encodeCallMsg({ from: zeroAddress, to: this.address, data: callData }),
        blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
      })
      .result()

    const [price, updatedAt] = decodeFunctionResult({
      abi: InsurArcPriceFeedABI,
      functionName: 'latestPrice' as const,
      data: bytesToHex(result.data),
    }) as [bigint, bigint]

    return { price, updatedAt }
  }

  // ── Write ───────────────────────────────────────────────────

  /**
   * Push a new price for a market on-chain.
   *
   * The DON delivers a signed report to the contract's onReport function.
   * Payload encodes (marketId: uint256, price: uint256) where price is
   * 8-decimal fixed-point (e.g. 0.97 USD → 97_000_000n).
   *
   * The contract stores the price and runs all depeg / resolution logic.
   * This workflow does NOT make any decisions — it is a pure data pipeline.
   */
  writeReportFromUpdatePrice(
    runtime: Runtime<unknown>,
    marketId: bigint,
    price: bigint,
    gasConfig?: { gasLimit?: string },
  ) {
    const callData: Hex = encodeAbiParameters(
      parseAbiParameters('uint256 marketId, uint256 price'),
      [marketId, price],
    )

    const reportResponse = runtime.report(prepareReportRequest(callData)).result()

    return this.client
      .writeReport(runtime, {
        receiver: this.address,
        report: reportResponse,
        gasConfig,
      })
      .result()
  }

  /**
   * Generic write — pass any ABI-encoded calldata.
   */
  writeReport(
    runtime: Runtime<unknown>,
    callData: Hex,
    gasConfig?: { gasLimit?: string },
  ) {
    const reportResponse = runtime.report(prepareReportRequest(callData)).result()

    return this.client
      .writeReport(runtime, {
        receiver: this.address,
        report: reportResponse,
        gasConfig,
      })
      .result()
  }
}
