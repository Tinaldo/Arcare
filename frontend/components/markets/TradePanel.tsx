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
  const market = useContract(marketAddress as `0x${string}`, PREDICTION_MARKET_ABI);
  const usdc = useContract(ARC_USDC_ADDRESS, ERC20_ABI);

  const [action, setAction] = useState<Action>("BUY");
  const [outcome, setOutcome] = useState<Outcome>("YES");
  const [amount, setAmount] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [txStep, setTxStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        setTxStep("Step 1 of 2: Approve USDC…");
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
    <div className="glass-card p-5">
      {/* BUY / SELL tabs */}
      <div className="mb-4 flex rounded-full bg-[rgba(116,91,255,0.08)] p-1">
        {(["BUY", "SELL"] as Action[]).map((a) => (
          <button
            key={a}
            onClick={() => setAction(a)}
            className={`flex-1 rounded-full py-2 text-sm font-bold transition-all ${
              action === a
                ? "bg-[#745BFF] text-white shadow-md shadow-[#745BFF]/30"
                : "text-slate-400 hover:text-slate-700"
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
            className={`flex-1 rounded-xl border py-2.5 text-sm font-bold transition-all ${
              outcome === o
                ? o === "YES"
                  ? "border-yes-green bg-yes-green/10 text-yes-green"
                  : "border-no-red bg-no-red/10 text-no-red"
                : "border-[rgba(116,91,255,0.12)] text-slate-400 hover:border-slate-300 hover:text-slate-600"
            }`}
          >
            {o}
          </button>
        ))}
      </div>

      {/* Amount input */}
      <div className="mb-3">
        <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">
          {action === "BUY" ? "USDC to spend" : `${outcome} tokens to sell`}
        </label>
        <div className="flex items-center gap-2 rounded-xl border border-[rgba(116,91,255,0.2)] bg-white/80 px-4 py-3">
          <input
            type="number"
            min="0"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="flex-1 bg-transparent text-lg font-bold text-slate-800 outline-none placeholder:text-slate-300 placeholder:font-normal"
          />
          <span className="text-sm font-semibold text-slate-400">{action === "BUY" ? "USDC" : outcome}</span>
        </div>
      </div>

      {preview && (
        <div className="mb-3 rounded-xl bg-[#745BFF]/8 border border-[rgba(116,91,255,0.15)] px-4 py-2.5 text-center text-sm font-semibold text-[#745BFF]">
          {preview}
        </div>
      )}

      <button
        onClick={handleTrade}
        disabled={!!txStep}
        className="arc-btn-primary w-full py-3 text-sm disabled:opacity-60"
      >
        {txStep ? (
          <span className="flex items-center justify-center gap-2">
            <Spinner size={16} />{txStep}
          </span>
        ) : isConnected ? (
          `${action} ${outcome}`
        ) : (
          "Connect Wallet to Trade"
        )}
      </button>

      {error && (
        <p className="mt-3 rounded-xl bg-red-500/8 border border-red-500/20 px-3 py-2 text-center text-sm text-red-500">
          {error}
        </p>
      )}
      <p className="mt-3 text-center text-xs text-slate-400">0.5% slippage tolerance</p>
    </div>
  );
}
