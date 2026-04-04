'use client'

// With wagmi + AppKit, wallet state is provided by WagmiProvider in app/providers.tsx.
// This file re-exports useWallet for backward-compatible imports across the app.
export { useWallet } from './useWallet'
export type { WalletState } from './useWallet'
