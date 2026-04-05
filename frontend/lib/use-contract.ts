'use client'

import { useWalletClient, usePublicClient } from 'wagmi'
import { useSwitchChain } from 'wagmi'
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
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient({ chainId: arcTestnet.id })
  const { switchChainAsync } = useSwitchChain()

  async function read(functionName: string, args: any[] = []) {
    if (!publicClient) throw new Error('Public client not available')
    return publicClient.readContract({ address, abi, functionName, args } as any)
  }

  async function write(functionName: string, args: readonly unknown[] = []) {
    if (!walletClient) throw new Error('Wallet not connected')
    if (!publicClient) throw new Error('Public client not available')
    if (walletClient.chain?.id !== arcTestnet.id) {
      await switchChainAsync({ chainId: arcTestnet.id })
    }
    const hash = await walletClient.writeContract({ address, abi, functionName, args, chain: arcTestnet } as any)
    await publicClient.waitForTransactionReceipt({ hash })
    return hash
  }

  return { read, write }
}
