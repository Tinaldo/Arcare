'use client'

import { useAccount, useDisconnect, useBalance } from 'wagmi'
import { useAppKit } from '@reown/appkit/react'
import { arcTestnet, formatTokenAmount } from '@/lib/arc-client'

export interface WalletState {
  address: `0x${string}` | undefined
  isConnected: boolean
  isOnArc: boolean
  balance: string | undefined
  connect: () => void
  disconnect: () => void
}

export function useWallet(): WalletState {
  const { address, isConnected, chain } = useAccount()
  const { disconnect } = useDisconnect()
  const { open } = useAppKit()
  const { data: balance } = useBalance({ address })

  const isOnArc = chain?.id === arcTestnet.id

  return {
    address,
    isConnected,
    isOnArc,
    balance: balance ? formatTokenAmount(balance.value, balance.decimals, 2) : undefined,
    connect: () => open(),
    disconnect,
  }
}
