'use client'

import { useWalletClient, usePublicClient } from 'wagmi'
import type { Abi } from 'viem'
import { arcTestnet } from './arc-client'

// Minimal ERC-20 ABI — approve only, used for USDC interactions
export const ERC20_ABI = [
  {
    type: 'function',
    name: 'approve',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
    stateMutability: 'nonpayable',
  },
] as const satisfies Abi

/**
 * React hook — returns read/write helpers for a deployed contract on Arc testnet.
 * Uses wagmi's walletClient (MetaMask / WalletConnect) for writes,
 * and wagmi's publicClient for reads.
 */
export function useContract(address: `0x${string}`, abi: Abi) {
  const { data: walletClient } = useWalletClient({ chainId: arcTestnet.id })
  const publicClient = usePublicClient({ chainId: arcTestnet.id })

  async function read(functionName: string, args: any[] = []) {
    if (!publicClient) throw new Error('Public client not available')
    return publicClient.readContract({ address, abi, functionName, args } as any)
  }

  async function write(functionName: string, args: readonly unknown[] = []) {
    if (!walletClient) throw new Error('Wallet not connected')
    // Dynamic dispatch — abi/functionName/args are runtime values; strict inference not possible here
    // @ts-expect-error dynamic contract call
    return walletClient.writeContract({ address, abi, functionName, args })
  }

  return { read, write }
}
