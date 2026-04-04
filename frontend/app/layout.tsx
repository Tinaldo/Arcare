import "./globals.css";
import { Providers } from "./providers";
import { Navbar } from "@/components/layout/Navbar";

export default function RootLayout({ children }: { children: React.ReactNode }) {
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
        <Providers>
          <Navbar />
          <main className="mx-auto max-w-7xl px-6 py-10">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
