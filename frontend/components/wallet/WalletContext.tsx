"use client";

import { createContext, useContext } from "react";
import type { CircleWalletState } from "./useCircleWallet";

const WalletContext = createContext<CircleWalletState | null>(null);

export const WalletProvider = WalletContext.Provider;

export function useWallet(): CircleWalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside WalletProvider");
  return ctx;
}
