"use client";

import "./globals.css";
import { useCircleWallet } from "@/components/wallet/useCircleWallet";
import { WalletProvider } from "@/components/wallet/WalletContext";
import { WalletModal } from "@/components/wallet/WalletModal";
import { Navbar } from "@/components/layout/Navbar";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const walletState = useCircleWallet();

  return (
    <html lang="en">
      <head>
        <title>InsurArc — Crypto Incident Prediction Market</title>
        <meta
          name="description"
          content="Predict stablecoin depegs and protocol hacks on Arc Testnet"
        />
      </head>
      <body suppressHydrationWarning>
        <WalletProvider value={walletState}>
          <Navbar walletState={walletState} />
          <main className="mx-auto max-w-7xl px-6 py-10">{children}</main>
          <WalletModal walletState={walletState} />
        </WalletProvider>
      </body>
    </html>
  );
}
