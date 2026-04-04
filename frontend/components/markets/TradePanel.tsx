"use client";

import { useEffect, useState } from "react";
import { Spinner } from "@/components/ui/Spinner";
import { arcClient, parseUsdc, formatUsdc } from "@/lib/arc-client";
import { PREDICTION_MARKET_ABI } from "@/lib/abis";
import { ARC_USDC_ADDRESS } from "@/lib/addresses";
import { useContract, ERC20_ABI } from "@/lib/use-contract";
import type { WalletState } from "@/components/wallet/useWallet";

interface Props {
  marketAddress: string;
  walletState: WalletState;
  onTxComplete?: () => void;
}

type Action = "BUY" | "SELL";
type Outcome = "YES" | "NO";

const SLIPPAGE = 0.005; // 0.5%

export function TradePanel({ marketAddress, walletState, onTxComplete }: Props) {
  const { isConnected, connect } = walletState;
  const market = useContract(marketAddress as `0x${string}`, PREDICTION_MARKET_ABI)
  const usdc = useContract(ARC_USDC_ADDRESS, ERC20_ABI)

  const [action, setAction] = useState<Action>("BUY");
  const [outcome, setOutcome] = useState<Outcome>("YES");
  const [amount, setAmount] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [txStep, setTxStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Live preview — debounced
  useEffect(() => {
    setPreview(null);
    if (!amount || parseFloat(amount) <= 0) return;
    const timeout = setTimeout(async () => {
      try {
        const addr = marketAddress as `0x${string}`;
        const isYes = outcome === "YES";
        const amtBig = parseUsdc(amount);
        if (action === "BUY") {
          const out = await arcClient.readContract({
            address: addr,
            abi: PREDICTION_MARKET_ABI,
            functionName: "calcBuy",
            args: [isYes, amtBig],
          });
          setPreview(`≈ ${formatUsdc(out as bigint)} ${outcome} tokens`);
        } else {
          const out = await arcClient.readContract({
            address: addr,
            abi: PREDICTION_MARKET_ABI,
            functionName: "calcSell",
            args: [isYes, parseUsdc(amount)],
          });
          setPreview(`≈ ${formatUsdc(out as bigint)} USDC`);
        }
      } catch {
        setPreview(null);
      }
    }, 400);
    return () => clearTimeout(timeout);
  }, [amount, action, outcome, marketAddress]);

  const handleTrade = async () => {
    if (!isConnected) { connect(); return; }
    setError(null);
    const amtBig = parseUsdc(amount);
    if (amtBig === 0n) { setError("Enter an amount"); return; }
    const isYes = outcome === "YES";

    try {
      if (action === "BUY") {
        setTxStep("Step 1 of 2: Approve USDC spend…");
        await usdc.write("approve", [marketAddress, amtBig]);

        setTxStep("Step 2 of 2: Confirm trade…");
        const minOut = BigInt(Math.floor(Number(amtBig) * (1 - SLIPPAGE)));
        await market.write("buyOutcome", [isYes, amtBig, minOut]);
      } else {
        setTxStep("Confirm sell…");
        const minOut = BigInt(Math.floor(Number(amtBig) * (1 - SLIPPAGE)));
        await market.write("sellOutcome", [isYes, amtBig, minOut]);
      }

      setAmount("");
      setTxStep(null);
      onTxComplete?.();
    } catch (e: unknown) {
      setError((e as Error).message ?? "Transaction failed");
      setTxStep(null);
    }
  };

  return (
    <div className="rounded-2xl border border-arc-border bg-arc-card p-5">
      {/* BUY / SELL tabs */}
      <div className="mb-4 flex rounded-xl bg-slate-100 p-1">
        {(["BUY", "SELL"] as Action[]).map((a) => (
          <button
            key={a}
            onClick={() => setAction(a)}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${
              action === a ? "bg-arc-blue text-white" : "text-slate-400 hover:text-slate-700"
            }`}
          >
            {a}
          </button>
        ))}
      </div>

      {/* YES / NO toggle */}
      <div className="mb-4 flex gap-2">
        {(["YES", "NO"] as Outcome[]).map((o) => (
          <button
            key={o}
            onClick={() => setOutcome(o)}
            className={`flex-1 rounded-xl border py-2 text-sm font-semibold transition-colors ${
              outcome === o
                ? o === "YES"
                  ? "border-yes-green bg-yes-green/15 text-yes-green"
                  : "border-no-red bg-no-red/15 text-no-red"
                : "border-arc-border text-slate-400 hover:border-slate-400 hover:text-slate-700"
            }`}
          >
            {o}
          </button>
        ))}
      </div>

      {/* Amount input */}
      <div className="mb-3">
        <label className="mb-1 block text-xs text-slate-500">
          {action === "BUY" ? "USDC to spend" : `${outcome} tokens to sell`}
        </label>
        <div className="flex items-center gap-2 rounded-xl border border-arc-border bg-slate-50 px-4 py-3">
          <input
            type="number"
            min="0"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="flex-1 bg-transparent text-lg font-medium text-slate-800 outline-none placeholder:text-slate-300"
          />
          <span className="text-sm text-slate-400">{action === "BUY" ? "USDC" : outcome}</span>
        </div>
      </div>

      {preview && (
        <p className="mb-3 text-center text-sm text-slate-500">{preview}</p>
      )}

      <button
        onClick={handleTrade}
        disabled={!!txStep}
        className="arc-btn-primary flex w-full items-center justify-center gap-2 py-3 text-sm font-semibold disabled:opacity-60"
      >
        {txStep ? (
          <><Spinner size={16} />{txStep}</>
        ) : isConnected ? (
          `${action} ${outcome}`
        ) : (
          "Connect Wallet to Trade"
        )}
      </button>

      {error && <p className="mt-3 text-center text-sm text-red-400">{error}</p>}
      <p className="mt-3 text-center text-xs text-slate-400">0.5% slippage tolerance</p>
    </div>
  );
}
