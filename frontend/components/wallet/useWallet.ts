'use client'

import { useEffect, useState } from 'react'
import { useAccount, useDisconnect } from 'wagmi'
import { useAppKit } from '@reown/appkit/react'
import { ERC20_ABI } from '@/lib/abis'
import { arcClient, arcTestnet, formatStableAmount } from '@/lib/arc-client'
import { getBalanceCollaterals } from '@/lib/collaterals'

export interface WalletBalance {
  symbol: string
  amount: string
  raw: bigint
}

export interface WalletState {
  address: `0x${string}` | undefined
  isConnected: boolean
  isOnArc: boolean
  balances: WalletBalance[]
  connect: () => void
  disconnect: () => void
}

export function useWallet(): WalletState {
  const { address, isConnected, chain } = useAccount()
  const { disconnect } = useDisconnect()
  const { open } = useAppKit()
  const [balances, setBalances] = useState<WalletBalance[]>([])

  const isOnArc = chain?.id === arcTestnet.id

  useEffect(() => {
    let stale = false

    async function loadBalances() {
      if (!address) {
        setBalances([])
        return
      }

      const collaterals = getBalanceCollaterals()
      const results = await Promise.allSettled(
        collaterals.map(async (collateral) => {
          const raw = (await arcClient.readContract({
            address: collateral.tokenAddress,
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: [address],
          })) as bigint

          return {
            symbol: collateral.symbol,
            amount: formatStableAmount(raw, 2),
            raw,
          } satisfies WalletBalance
        })
      )

      if (stale) return

      setBalances(
        results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []))
      )
    }

    void loadBalances()

    return () => {
      stale = true
    }
  }, [address, isConnected])

  return {
    address,
    isConnected,
    isOnArc,
    balances,
    connect: () => open(),
    disconnect,
  }
}
