import "./globals.css";
import { Providers } from "./providers";
import { Navbar } from "@/components/layout/Navbar";
import { Sidebar } from "@/components/layout/Sidebar";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <title>ArCare — Crypto Incident Prediction Market</title>
        <meta name="description" content="Predict stablecoin depegs and protocol hacks on Arc Testnet" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
          rel="stylesheet"
        />
      </head>
      <body suppressHydrationWarning>
        <Providers>
          <div className="flex min-h-screen">
            <Sidebar />
            <div className="flex flex-1 flex-col min-w-0">
              <Navbar />
              <main className="flex-1 px-6 py-8 lg:px-10">{children}</main>
            </div>
          </div>
        </Providers>
      </body>
    </html>
  );
}
