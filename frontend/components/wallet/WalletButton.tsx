'use client'

import { TokenLogo } from '@/components/tokens/TokenLogo'
import { useWallet } from './WalletContext'

function truncate(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

export function WalletButton() {
  const { address, isConnected, isOnArc, balances, connect, disconnect } = useWallet()

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-3">
        {!isOnArc && (
          <span className="hidden text-xs font-semibold text-orange-500 sm:inline-flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">warning</span>
            Switch to Arc Testnet
          </span>
        )}
        {balances.length > 0 && (
          <div className="hidden flex-col items-end gap-1 sm:flex">
            {balances.map((balance) => (
              <span
                key={balance.symbol}
                className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700"
              >
                <TokenLogo symbol={balance.symbol} size={18} />
                {balance.amount}
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2 rounded-full border border-[rgba(116,91,255,0.2)] bg-white/70 px-4 py-2 shadow-sm">
          <span className="h-2 w-2 rounded-full bg-yes-green" />
          <span className="font-mono text-sm font-medium text-slate-800">{truncate(address)}</span>
          <button
            onClick={() => disconnect()}
            className="ml-1 text-slate-400 hover:text-slate-700 transition-colors"
            title="Disconnect"
          >
            <span className="material-symbols-outlined text-[16px]">logout</span>
          </button>
        </div>
      </div>
    )
  }

  return (
    <button
      onClick={connect}
      className="arc-btn-primary px-5 py-2 text-sm"
    >
      Connect Wallet
    </button>
  )
}
