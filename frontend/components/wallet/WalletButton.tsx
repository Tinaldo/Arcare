'use client'

import { useWallet } from './WalletContext'

function truncate(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

export function WalletButton() {
  const { address, isConnected, isOnArc, balance, connect, disconnect } = useWallet()

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-3">
        {!isOnArc && (
          <span className="text-xs text-orange-500 font-medium">
            ⚠ Switch to Arc Testnet
          </span>
        )}
        {balance !== undefined && (
          <span className="text-sm font-medium text-slate-600">
            {parseFloat(balance).toFixed(2)} USDC
          </span>
        )}
        <div className="flex items-center gap-2 rounded-xl border border-arc-border bg-arc-card px-4 py-2">
          <span className="h-2 w-2 rounded-full bg-yes-green" />
          <span className="font-mono text-sm text-slate-800">{truncate(address)}</span>
          <button
            onClick={() => disconnect()}
            className="ml-1 text-xs text-slate-400 hover:text-slate-700"
            title="Disconnect"
          >
            ✕
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
