"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui/Spinner";
import { TokenLogo } from "@/components/tokens/TokenLogo";
import { useWallet } from "@/components/wallet/WalletContext";
import { arcClient, parseStableAmount } from "@/lib/arc-client";
import { MARKET_FACTORY_ABI, DEPEG_RESOLVER_ABI } from "@/lib/abis";
import {
  ARC_EURC_ADDRESS,
  ARC_USDC_ADDRESS,
  DEPEG_RESOLVER_ADDRESS,
  EURC_DEPEG_RESOLVER_ADDRESS,
  EURC_MARKET_FACTORY_ADDRESS,
  MARKET_FACTORY_ADDRESS,
} from "@/lib/addresses";
import { getMarketCollaterals } from "@/lib/collaterals";
import {
  detectCollateralForMarket,
  loadManagedMarkets as fetchManagedMarkets,
  type ManagedMarket,
} from "@/lib/markets";
import { useContract, ERC20_ABI } from "@/lib/use-contract";

type Roles = {
  isAdmin: boolean;
  isCreator: boolean;
  adminCollaterals: string[];
  creatorCollaterals: string[];
};

const CONFIGURED_COLLATERALS = getMarketCollaterals();

const PRICE_FEEDS = [
  { label: "None", address: "0x0000000000000000000000000000000000000000", coin: "" },
  { label: "DAI / USD", address: "0x14866185B1962B63C3Ea9E03Bc1da838bab34C19", coin: "DAI" },
  { label: "FRAX / USD", address: "0x0b9E1E3a9FEBB3C3AeFc5B3875Ea5Ca8F6CA3519", coin: "FRAX" },
  { label: "LUSD / USD", address: "0x3D7aE7E594f2f2091Ad8798313450130d0Aba3a0", coin: "LUSD" },
];

function formatAdminDeadline(deadline: bigint) {
  return new Date(Number(deadline) * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function buildGrantCommands(targetAddress: string) {
  return CONFIGURED_COLLATERALS.map(
    (collateral) => `cast send ${collateral.factoryAddress} \\
  "grantMarketCreator(address)" ${targetAddress} \\
  --rpc-url https://rpc.testnet.arc.network \\
  --account deployer`
  ).join("\n\n");
}

export default function AdminPage() {
  const { isConnected, address, connect } = useWallet();
  const router = useRouter();

  const usdcFactory = useContract(MARKET_FACTORY_ADDRESS, MARKET_FACTORY_ABI);
  const usdcResolver = useContract(DEPEG_RESOLVER_ADDRESS, DEPEG_RESOLVER_ABI);
  const usdcToken = useContract(ARC_USDC_ADDRESS, ERC20_ABI);
  const eurcFactory = useContract(EURC_MARKET_FACTORY_ADDRESS, MARKET_FACTORY_ABI);
  const eurcResolver = useContract(EURC_DEPEG_RESOLVER_ADDRESS, DEPEG_RESOLVER_ABI);
  const eurcToken = useContract(ARC_EURC_ADDRESS, ERC20_ABI);

  const [roles, setRoles] = useState<Roles | null>(null);
  const [loadingRoles, setLoadingRoles] = useState(false);

  const [question, setQuestion] = useState("");
  const [category, setCategory] = useState<"DEPEG" | "HACK">("DEPEG");
  const [depegAsset, setDepegAsset] = useState("");
  const [depegThreshold, setDepegThreshold] = useState("");
  const [deadline, setDeadline] = useState("");
  const [liquidity, setLiquidity] = useState("10");
  const [priceFeed, setPriceFeed] = useState(PRICE_FEEDS[0].address);
  const [feedMenuOpen, setFeedMenuOpen] = useState(false);
  const [createStep, setCreateStep] = useState<string | null>(null);
  const [createError, setCreateError] = useState("");
  const [createDone, setCreateDone] = useState(false);

  const [managedMarkets, setManagedMarkets] = useState<ManagedMarket[]>([]);
  const [loadingMarkets, setLoadingMarkets] = useState(false);
  const [removeTarget, setRemoveTarget] = useState("");
  const [removeStep, setRemoveStep] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState("");
  const [removeDone, setRemoveDone] = useState("");

  const [roleTarget, setRoleTarget] = useState("");
  const [roleStep, setRoleStep] = useState<string | null>(null);
  const [roleError, setRoleError] = useState("");
  const [roleDone, setRoleDone] = useState("");

  const [forceResolveTarget, setForceResolveTarget] = useState("");
  const [forceResolveOutcome, setForceResolveOutcome] = useState<"yes" | "no">("yes");
  const [forceResolveStep, setForceResolveStep] = useState<string | null>(null);
  const [forceResolveError, setForceResolveError] = useState("");
  const [forceResolveDone, setForceResolveDone] = useState("");

  const [selectedCollaterals, setSelectedCollaterals] = useState<string[]>(
    () => CONFIGURED_COLLATERALS.map((c) => c.symbol)
  );

  const toggleCollateral = (symbol: string) => {
    setSelectedCollaterals((prev) => {
      if (prev.includes(symbol)) {
        if (prev.length === 1) return prev; // must keep at least one
        return prev.filter((s) => s !== symbol);
      }
      return [...prev, symbol];
    });
  };

  const getContractsForSymbol = useCallback((symbol: string) => {
    return symbol === "EURC"
      ? { factory: eurcFactory, resolver: eurcResolver, token: eurcToken }
      : { factory: usdcFactory, resolver: usdcResolver, token: usdcToken };
  }, [eurcFactory, eurcResolver, eurcToken, usdcFactory, usdcResolver, usdcToken]);

  useEffect(() => {
    if (category !== "DEPEG") return;
    if (!depegAsset && !depegThreshold) return;
    const asset = depegAsset.trim() || "TOKEN";
    const threshold = depegThreshold.trim() || "0.99";
    const dateStr = deadline
      ? new Date(deadline).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : "<resolution date>";
    setQuestion(`Will ${asset} depeg below $${threshold} before ${dateStr}?`);
  }, [category, depegAsset, depegThreshold, deadline]);

  const loadRoles = useCallback(async () => {
    if (!address || CONFIGURED_COLLATERALS.length === 0) return;
    setLoadingRoles(true);
    try {
      const checks = await Promise.all(
        CONFIGURED_COLLATERALS.map(async (collateral) => {
          const [creatorRole, adminRole] = await Promise.all([
            arcClient.readContract({
              address: collateral.factoryAddress,
              abi: MARKET_FACTORY_ABI,
              functionName: "MARKET_CREATOR_ROLE",
            }) as Promise<`0x${string}`>,
            arcClient.readContract({
              address: collateral.factoryAddress,
              abi: MARKET_FACTORY_ABI,
              functionName: "DEFAULT_ADMIN_ROLE",
            }) as Promise<`0x${string}`>,
          ]);

          const [isCreator, isAdmin] = await Promise.all([
            arcClient.readContract({
              address: collateral.factoryAddress,
              abi: MARKET_FACTORY_ABI,
              functionName: "hasRole",
              args: [creatorRole, address],
            }) as Promise<boolean>,
            arcClient.readContract({
              address: collateral.factoryAddress,
              abi: MARKET_FACTORY_ABI,
              functionName: "hasRole",
              args: [adminRole, address],
            }) as Promise<boolean>,
          ]);

          return { symbol: collateral.symbol, isCreator, isAdmin };
        })
      );

      setRoles({
        isAdmin: checks.some((check) => check.isAdmin),
        isCreator: checks.some((check) => check.isCreator),
        adminCollaterals: checks.filter((check) => check.isAdmin).map((check) => check.symbol),
        creatorCollaterals: checks.filter((check) => check.isCreator).map((check) => check.symbol),
      });
    } catch {
      setRoles({ isAdmin: false, isCreator: false, adminCollaterals: [], creatorCollaterals: [] });
    } finally {
      setLoadingRoles(false);
    }
  }, [address]);

  useEffect(() => {
    if (isConnected) void loadRoles();
  }, [isConnected, loadRoles]);

  const loadManagedMarkets = useCallback(async () => {
    if (CONFIGURED_COLLATERALS.length === 0) return;
    setLoadingMarkets(true);
    try {
      setManagedMarkets(await fetchManagedMarkets());
    } finally {
      setLoadingMarkets(false);
    }
  }, []);

  useEffect(() => {
    if (isConnected) void loadManagedMarkets();
  }, [isConnected, loadManagedMarkets]);

  const resolveManagedMarket = useCallback(async (marketAddress: string) => {
    const existing = managedMarkets.find((market) => market.address === marketAddress);
    if (existing) return existing.collateralSymbol;

    const detected = await detectCollateralForMarket(marketAddress as `0x${string}`);
    if (!detected) throw new Error("Could not determine the market collateral");
    return detected.symbol;
  }, [managedMarkets]);

  const handleCreateMarket = async () => {
    if (!isConnected) { connect(); return; }
    setCreateError("");
    setCreateDone(false);

    if (!question.trim()) { setCreateError("Enter a question"); return; }
    if (!deadline) { setCreateError("Select a resolution date"); return; }
    if (selectedCollaterals.length === 0) {
      setCreateError("Select at least one collateral to create a market on");
      return;
    }

    const deadlineTs = Math.floor(new Date(deadline).getTime() / 1000);
    if (deadlineTs <= Math.floor(Date.now() / 1000)) {
      setCreateError("Deadline must be in the future");
      return;
    }
    if (category === "DEPEG") {
      const threshold = Number(depegThreshold);
      if (!depegThreshold || Number.isNaN(threshold) || threshold <= 0 || threshold >= 1) {
        setCreateError("Depeg threshold must be between $0.01 and $0.99");
        return;
      }
    }

    const activeCollaterals = CONFIGURED_COLLATERALS.filter((c) =>
      selectedCollaterals.includes(c.symbol)
    );

    const missingCreator = activeCollaterals
      .filter((collateral) => !roles?.creatorCollaterals.includes(collateral.symbol))
      .map((collateral) => collateral.symbol);
    if (missingCreator.length > 0) {
      setCreateError(`Creator role missing on: ${missingCreator.join(", ")}`);
      return;
    }

    const liquidityAmount = parseStableAmount(liquidity);
    if (liquidityAmount === 0n) { setCreateError("Enter initial liquidity"); return; }

    const normalizedPriceFeed =
      priceFeed.trim() === "" ? "0x0000000000000000000000000000000000000000" : priceFeed.trim();
    if (!normalizedPriceFeed.startsWith("0x") || normalizedPriceFeed.length !== 42) {
      setCreateError("Enter a valid price feed address or leave it empty");
      return;
    }

    try {
      const totalSteps = activeCollaterals.length * 2;
      let stepIndex = 1;

      for (const collateral of activeCollaterals) {
        const contracts = getContractsForSymbol(collateral.symbol);
        setCreateStep(`Step ${stepIndex} of ${totalSteps}: Approve ${collateral.symbol}…`);
        await contracts.token.write("approve", [collateral.resolverAddress, liquidityAmount]);
        stepIndex += 1;

        setCreateStep(`Step ${stepIndex} of ${totalSteps}: Create ${collateral.symbol} market…`);
        await contracts.resolver.write("createMarket", [
          question,
          category,
          BigInt(deadlineTs),
          liquidityAmount,
          normalizedPriceFeed,
        ]);
        stepIndex += 1;
      }

      setCreateDone(true);
      setCreateStep(null);
      setQuestion("");
      setDepegAsset("");
      setDepegThreshold("");
      setDeadline("");
      setLiquidity("10");
      setPriceFeed(PRICE_FEEDS[0].address);
      void loadManagedMarkets();
    } catch (e: unknown) {
      setCreateError((e as Error).message ?? "Failed to create market");
      setCreateStep(null);
    }
  };

  const handleClaimLiquidity = async (marketAddress: string, collateralSymbol: string) => {
    if (!isConnected) { connect(); return; }
    setRemoveError("");
    setRemoveDone("");
    setRemoveStep("Claiming liquidity…");
    try {
      await getContractsForSymbol(collateralSymbol).resolver.write("claimLiquidity", [marketAddress]);
      setRemoveDone(`Liquidity claimed from ${marketAddress.slice(0, 10)}…`);
    } catch (e: unknown) {
      setRemoveError((e as Error).message ?? "Failed to claim liquidity");
    } finally {
      setRemoveStep(null);
    }
  };

  const handleRemoveMarket = async (marketAddress?: string) => {
    const target = (marketAddress ?? removeTarget).trim();
    if (!isConnected) { connect(); return; }
    if (!target.startsWith("0x") || target.length !== 42) {
      setRemoveError("Enter a valid market address");
      return;
    }

    setRemoveError("");
    setRemoveDone("");
    setRemoveStep("Removing market from registry…");

    try {
      const collateralSymbol = await resolveManagedMarket(target);
      await getContractsForSymbol(collateralSymbol).factory.write("removeMarket", [target]);
      setRemoveDone(`Market removed: ${target.slice(0, 10)}…`);
      setRemoveTarget("");
      await loadManagedMarkets();
    } catch (e: unknown) {
      setRemoveError((e as Error).message ?? "Failed to remove market");
    } finally {
      setRemoveStep(null);
    }
  };

  const handleDeleteMarket = async (marketAddress?: string) => {
    const target = (marketAddress ?? removeTarget).trim();
    if (!isConnected) { connect(); return; }
    if (!target.startsWith("0x") || target.length !== 42) {
      setRemoveError("Enter a valid market address");
      return;
    }

    setRemoveError("");
    setRemoveDone("");
    setRemoveStep("Refunding owner and deleting market…");

    try {
      const collateralSymbol = await resolveManagedMarket(target);
      await getContractsForSymbol(collateralSymbol).factory.write("deleteMarket", [target]);
      setRemoveDone(`Market deleted and refunded: ${target.slice(0, 10)}…`);
      setRemoveTarget("");
      await loadManagedMarkets();
    } catch (e: unknown) {
      setRemoveError((e as Error).message ?? "Failed to delete market");
    } finally {
      setRemoveStep(null);
    }
  };

  const handleRole = async (action: "grant" | "revoke") => {
    if (!isConnected) { connect(); return; }
    if (!roleTarget.startsWith("0x") || roleTarget.length !== 42) {
      setRoleError("Enter a valid 0x address");
      return;
    }
    if (!roles || roles.adminCollaterals.length === 0) {
      setRoleError("Your wallet is not admin on any configured collateral");
      return;
    }

    setRoleError("");
    setRoleDone("");
    setRoleStep(`${action === "grant" ? "Granting" : "Revoking"} role…`);
    try {
      const fn = action === "grant" ? "grantMarketCreator" : "revokeMarketCreator";
      for (const symbol of roles.adminCollaterals) {
        await getContractsForSymbol(symbol).factory.write(fn, [roleTarget]);
      }
      setRoleDone(
        `Role ${action === "grant" ? "granted to" : "revoked from"} ${roleTarget.slice(0, 10)}… on ${roles.adminCollaterals.join(", ")}`
      );
      setRoleTarget("");
    } catch (e: unknown) {
      setRoleError((e as Error).message ?? "Transaction failed");
    } finally {
      setRoleStep(null);
    }
  };

  const handleForceResolve = async () => {
    if (!isConnected) { connect(); return; }
    const target = forceResolveTarget.trim();
    if (!target.startsWith("0x") || target.length !== 42) {
      setForceResolveError("Enter a valid market address");
      return;
    }
    setForceResolveError("");
    setForceResolveDone("");
    setForceResolveStep("Sending force resolve…");
    try {
      const collateralSymbol = await resolveManagedMarket(target);
      await getContractsForSymbol(collateralSymbol).resolver.write("forceResolve", [target, forceResolveOutcome === "yes"]);
      setForceResolveDone(`Market ${target.slice(0, 10)}… resolved as ${forceResolveOutcome.toUpperCase()}`);
      setForceResolveTarget("");
    } catch (e: unknown) {
      setForceResolveError((e as Error).message ?? "Transaction failed");
    } finally {
      setForceResolveStep(null);
    }
  };

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24">
        <span className="material-symbols-outlined text-[48px] text-slate-300">admin_panel_settings</span>
        <p className="font-medium text-slate-500">Connect your wallet to access the admin dashboard.</p>
        <button onClick={connect} className="arc-btn-primary px-6 py-2.5">
          Connect Wallet
        </button>
      </div>
    );
  }

  if (CONFIGURED_COLLATERALS.length === 0) {
    return (
      <div className="py-20 text-center text-slate-500">
        Deploy contracts first and set the USDC/EURC factory, resolver, and token addresses in <code className="font-mono text-[#745BFF]">frontend/.env.local</code>.
      </div>
    );
  }

  if (loadingRoles || !roles) {
    return <div className="flex justify-center py-20"><Spinner size={32} /></div>;
  }

  if (!roles.isAdmin && !roles.isCreator) {
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <h1 className="text-2xl font-extrabold text-slate-900">Admin Dashboard</h1>
        <div className="glass-card space-y-4 p-6">
          <div className="flex items-center gap-2 font-semibold text-slate-800">
            <span className="material-symbols-outlined text-[20px] text-amber-500">lock</span>
            Your wallet doesn&apos;t have creator access yet.
          </div>
          <p className="text-sm text-slate-500">
            Share your wallet address with the project admin so they can grant you access on every configured collateral factory.
          </p>

          <div className="rounded-xl border border-[rgba(116,91,255,0.12)] bg-[rgba(116,91,255,0.05)] p-4">
            <p className="mb-1 text-xs font-bold uppercase tracking-widest text-slate-400">Your wallet address</p>
            <code className="block break-all font-mono text-sm text-[#745BFF] select-all">{address}</code>
          </div>

          <p className="text-xs text-slate-400">
            Ask the admin to run these commands with the deployer key:
          </p>
          <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-xl bg-slate-900 p-4 text-xs text-green-400 select-all">
{buildGrantCommands(address ?? "<YOUR_ADDRESS>")}
          </pre>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-slate-900">Admin Dashboard</h1>
        <div className="flex flex-wrap gap-2">
          {roles.creatorCollaterals.map((symbol) => (
            <span
              key={`creator-${symbol}`}
              className="inline-flex items-center gap-2 rounded-full bg-[#745BFF]/10 px-3 py-1 text-xs font-bold text-[#745BFF]"
            >
              <TokenLogo symbol={symbol} size={14} />
              Creator
            </span>
          ))}
          {roles.adminCollaterals.map((symbol) => (
            <span
              key={`admin-${symbol}`}
              className="inline-flex items-center gap-2 rounded-full bg-[#5b3ee5]/10 px-3 py-1 text-xs font-bold text-[#5b3ee5]"
            >
              <TokenLogo symbol={symbol} size={14} />
              Admin
            </span>
          ))}
        </div>
      </div>

      {roles.isCreator && (
        <div className="glass-card space-y-5 p-6">
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <span className="material-symbols-outlined text-[20px] text-[#745BFF]">add_circle</span>
            Create Market
          </h2>

          {createDone && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-yes-green/30 bg-yes-green/8 p-4 font-semibold text-yes-green">
              <span className="material-symbols-outlined text-[18px]">check_circle</span>
              Market pair created on
              {CONFIGURED_COLLATERALS.map((collateral) => (
                <span key={collateral.symbol} className="inline-flex items-center gap-1">
                  <TokenLogo symbol={collateral.symbol} size={14} />
                  {collateral.symbol}
                </span>
              ))}
              <button onClick={() => router.push("/")} className="ml-1 underline">View markets</button>
            </div>
          )}

          <div className="space-y-4">
            <div className="rounded-xl border border-[rgba(116,91,255,0.12)] bg-[rgba(116,91,255,0.04)] p-4">
              <p className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-400">Create On</p>
              <div className="flex flex-wrap gap-2">
                {CONFIGURED_COLLATERALS.map((collateral) => {
                  const active = selectedCollaterals.includes(collateral.symbol);
                  const isLast = selectedCollaterals.length === 1 && active;
                  return (
                    <button
                      key={collateral.symbol}
                      type="button"
                      disabled={isLast}
                      onClick={() => toggleCollateral(collateral.symbol)}
                      title={isLast ? "At least one collateral must be selected" : undefined}
                      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-widest transition-all ${
                        active
                          ? "border-[#745BFF] bg-[#745BFF]/10 text-[#745BFF]"
                          : "border-[rgba(116,91,255,0.12)] bg-white/50 text-slate-400"
                      } disabled:cursor-not-allowed`}
                    >
                      <TokenLogo symbol={collateral.symbol} size={16} />
                      {collateral.symbol}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Toggle currencies to select which ones to create this market on.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">Category</label>
                <select
                  className="arc-input"
                  value={category}
                  onChange={(e) => {
                    const value = e.target.value as "DEPEG" | "HACK";
                    setCategory(value);
                    if (value === "HACK") {
                      setPriceFeed(PRICE_FEEDS[0].address);
                      setFeedMenuOpen(false);
                      setDepegAsset("");
                      setDepegThreshold("");
                    }
                  }}
                >
                  <option value="DEPEG">DEPEG</option>
                  <option value="HACK">HACK</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">Resolution Date</label>
                <input
                  type="date"
                  className="arc-input"
                  value={deadline}
                  min={new Date(Date.now() + 86400000).toISOString().split("T")[0]}
                  onChange={(e) => setDeadline(e.target.value)}
                />
              </div>
            </div>

            {category === "DEPEG" && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">Asset Name</label>
                  <input
                    className="arc-input"
                    placeholder="USDC, DAI, FRAX…"
                    value={depegAsset}
                    onChange={(e) => setDepegAsset(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">Depeg Threshold (USD)</label>
                  <div className="flex items-center gap-2 rounded-xl border border-[rgba(116,91,255,0.2)] bg-white/80 px-4 py-3">
                    <span className="text-sm font-bold text-slate-400">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      max="0.9999"
                      placeholder="0.97"
                      className="flex-1 bg-transparent text-lg font-bold text-slate-800 outline-none placeholder:text-slate-300"
                      value={depegThreshold}
                      onChange={(e) => setDepegThreshold(e.target.value)}
                    />
                    <span className="text-sm font-semibold text-slate-400">USD</span>
                  </div>
                  {depegThreshold && (Number(depegThreshold) <= 0 || Number(depegThreshold) >= 1) && (
                    <p className="mt-1 text-xs text-no-red">Threshold must be between $0.01 and $0.99</p>
                  )}
                </div>
              </div>
            )}

            <div>
              <label className="mb-1.5 flex items-center justify-between text-xs font-bold uppercase tracking-widest text-slate-400">
                <span>Question</span>
                {category === "DEPEG" && <span className="normal-case font-normal text-[#745BFF]">auto-generated — edit to customise</span>}
              </label>
              <input
                className="arc-input"
                placeholder="Will USDC depeg below $0.99 before Dec 31, 2026?"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">
                Initial Liquidity (per currency)
              </label>
              <div className="flex items-center gap-2 rounded-xl border border-[rgba(116,91,255,0.2)] bg-white/80 px-4 py-3">
                <input
                  type="number"
                  min="1"
                  className="flex-1 bg-transparent text-lg font-bold text-slate-800 outline-none placeholder:text-slate-300"
                  value={liquidity}
                  onChange={(e) => setLiquidity(e.target.value)}
                />
                <span className="text-sm font-semibold text-slate-400">per market</span>
              </div>
            </div>

            <div className="relative">
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">
                Price Feed
                {category === "HACK" && <span className="ml-2 normal-case font-normal text-slate-400">(not applicable for HACK)</span>}
              </label>
              <button
                type="button"
                disabled={category === "HACK"}
                onClick={() => setFeedMenuOpen(!feedMenuOpen)}
                className="arc-input flex w-full items-center justify-between text-left disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className={priceFeed === PRICE_FEEDS[0].address ? "text-slate-400" : "font-semibold text-slate-800"}>
                  {PRICE_FEEDS.find((feed) => feed.address === priceFeed)?.label ?? "Select feed…"}
                </span>
                <span className="ml-2 text-xs text-slate-400">{feedMenuOpen ? "▲" : "▼"}</span>
              </button>

              {feedMenuOpen && category !== "HACK" && (
                <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-[rgba(116,91,255,0.2)] bg-white shadow-lg">
                  {PRICE_FEEDS.map((feed) => (
                    <button
                      key={feed.address}
                      type="button"
                      onClick={() => {
                        setPriceFeed(feed.address);
                        setFeedMenuOpen(false);
                        if (feed.coin) setDepegAsset(feed.coin);
                      }}
                      className={`flex w-full items-center justify-between px-4 py-3 text-sm transition-colors hover:bg-[rgba(116,91,255,0.06)] ${
                        priceFeed === feed.address ? "bg-[rgba(116,91,255,0.08)] font-semibold text-[#745BFF]" : "text-slate-700"
                      }`}
                    >
                      <span>{feed.label}</span>
                      {feed.coin && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-mono text-slate-500">
                          {feed.address.slice(0, 6)}…{feed.address.slice(-4)}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <button className="arc-btn-primary w-full py-3" onClick={handleCreateMarket} disabled={!!createStep}>
            {createStep ? (
              <span className="flex items-center justify-center gap-2"><Spinner size={16} />{createStep}</span>
            ) : "Create Market Pair"}
          </button>
          {createError && (
            <p className="rounded-xl border border-red-500/20 bg-red-500/8 px-3 py-2 text-sm text-red-500">
              {createError}
            </p>
          )}
        </div>
      )}

      {roles.isAdmin && (
        <div className="glass-card space-y-5 p-6">
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <span className="material-symbols-outlined text-[20px] text-[#745BFF]">delete</span>
            Market Registry
          </h2>

          <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-4 text-sm text-slate-600">
            Delete refunds the market owner and unregisters the market, but only if there are no trader positions and no external LPs. Remove only unregisters the market and does not refund collateral.
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">Manual Market Address</label>
            <div className="flex gap-3">
              <input
                className="arc-input flex-1"
                placeholder="0x…"
                value={removeTarget}
                onChange={(e) => setRemoveTarget(e.target.value)}
              />
              <button
                onClick={() => void handleDeleteMarket()}
                disabled={!!removeStep}
                className="rounded-full border border-no-red px-5 py-2.5 text-sm font-bold text-no-red transition-colors hover:bg-no-red/5 disabled:opacity-50"
              >
                Delete
              </button>
              <button
                onClick={() => void handleRemoveMarket()}
                disabled={!!removeStep}
                className="rounded-full border border-slate-300 px-5 py-2.5 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
                Current Registered Markets
              </p>
              {loadingMarkets && <Spinner size={16} />}
            </div>

            {managedMarkets.length === 0 ? (
              <div className="rounded-xl border border-[rgba(116,91,255,0.12)] bg-[rgba(116,91,255,0.04)] p-4 text-sm text-slate-500">
                No registered markets.
              </div>
            ) : (
              <div className="space-y-3">
                {managedMarkets.map((market) => (
                  <div
                    key={market.address}
                    className="flex flex-col gap-3 rounded-xl border border-[rgba(116,91,255,0.12)] bg-[rgba(116,91,255,0.04)] p-4 lg:flex-row lg:items-center lg:justify-between"
                  >
                    <div className="space-y-1">
                      <p className="font-semibold text-slate-900">{market.question}</p>
                      <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1">
                          <TokenLogo symbol={market.collateralSymbol} size={14} />
                          {market.collateralSymbol}
                        </span>
                        <span>{market.category}</span>
                        <span>Deadline: {formatAdminDeadline(market.resolutionDeadline)}</span>
                        {market.priceFeed !== "0x0000000000000000000000000000000000000000" && (
                          <span>Feed: {market.priceFeed.slice(0, 8)}…{market.priceFeed.slice(-4)}</span>
                        )}
                      </div>
                      <code className="block break-all text-xs text-[#745BFF]">{market.address}</code>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => void handleClaimLiquidity(market.address, market.collateralSymbol)}
                        disabled={!!removeStep}
                        className="rounded-full border border-[#745BFF] px-4 py-2 text-sm font-bold text-[#745BFF] transition-colors hover:bg-[rgba(116,91,255,0.06)] disabled:opacity-50"
                      >
                        Claim LP
                      </button>
                      <button
                        onClick={() => void handleDeleteMarket(market.address)}
                        disabled={!!removeStep}
                        className="rounded-full border border-no-red px-4 py-2 text-sm font-bold text-no-red transition-colors hover:bg-no-red/5 disabled:opacity-50"
                      >
                        Delete
                      </button>
                      <button
                        onClick={() => void handleRemoveMarket(market.address)}
                        disabled={!!removeStep}
                        className="rounded-full border border-slate-300 px-4 py-2 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {removeDone && (
            <p className="flex items-center gap-1.5 text-sm font-semibold text-yes-green">
              <span className="material-symbols-outlined text-[16px]">check_circle</span>
              {removeDone}
            </p>
          )}
          {removeError && (
            <p className="rounded-xl border border-red-500/20 bg-red-500/8 px-3 py-2 text-sm text-red-500">
              {removeError}
            </p>
          )}
        </div>
      )}

      {roles.isAdmin && (
        <div className="glass-card space-y-5 p-6">
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <span className="material-symbols-outlined text-[20px] text-[#745BFF]">gavel</span>
            Force Resolve Market
          </h2>
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-slate-600">
            Bypasses the depeg block requirement. Use for demos or emergencies. Calls the matching resolver based on the market collateral.
          </div>
          <div className="space-y-3">
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">Market Address</label>
              <input
                className="arc-input"
                placeholder="0x…"
                value={forceResolveTarget}
                onChange={(e) => setForceResolveTarget(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">Outcome</label>
              <div className="flex gap-3">
                <button
                  onClick={() => setForceResolveOutcome("yes")}
                  className={`flex-1 rounded-full border py-2.5 text-sm font-bold transition-colors ${
                    forceResolveOutcome === "yes"
                      ? "border-yes-green bg-yes-green/10 text-yes-green"
                      : "border-slate-300 text-slate-500 hover:border-yes-green hover:text-yes-green"
                  }`}
                >
                  YES wins
                </button>
                <button
                  onClick={() => setForceResolveOutcome("no")}
                  className={`flex-1 rounded-full border py-2.5 text-sm font-bold transition-colors ${
                    forceResolveOutcome === "no"
                      ? "border-no-red bg-no-red/10 text-no-red"
                      : "border-slate-300 text-slate-500 hover:border-no-red hover:text-no-red"
                  }`}
                >
                  NO wins
                </button>
              </div>
            </div>
            <button className="arc-btn-primary w-full py-3" onClick={() => void handleForceResolve()} disabled={!!forceResolveStep}>
              {forceResolveStep ? <span className="flex items-center justify-center gap-2"><Spinner size={16} />{forceResolveStep}</span> : "Force Resolve"}
            </button>
            {forceResolveDone && (
              <p className="flex items-center gap-1.5 text-sm font-semibold text-yes-green">
                <span className="material-symbols-outlined text-[16px]">check_circle</span>
                {forceResolveDone}
              </p>
            )}
            {forceResolveError && (
              <p className="rounded-xl border border-red-500/20 bg-red-500/8 px-3 py-2 text-sm text-red-500">
                {forceResolveError}
              </p>
            )}
          </div>
        </div>
      )}

      {(roles.isAdmin || roles.isCreator) && (
        <div className="glass-card space-y-5 p-6">
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <span className="material-symbols-outlined text-[20px] text-[#745BFF]">manage_accounts</span>
            Grant Creator Access
          </h2>

          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">
              Friend&apos;s Wallet Address
            </label>
            <input
              className="arc-input"
              placeholder="0x…"
              value={roleTarget}
              onChange={(e) => setRoleTarget(e.target.value)}
            />
          </div>

          {roles.isAdmin ? (
            <>
              <div className="flex gap-3">
                <button
                  className="arc-btn-primary flex-1 py-2.5 text-sm"
                  onClick={() => void handleRole("grant")}
                  disabled={!!roleStep}
                >
                  {roleStep ? <Spinner size={16} /> : "Grant Creator Role"}
                </button>
                <button
                  onClick={() => void handleRole("revoke")}
                  disabled={!!roleStep}
                  className="flex-1 rounded-full border border-no-red py-2.5 text-sm font-bold text-no-red transition-colors hover:bg-no-red/5 disabled:opacity-50"
                >
                  Revoke Creator Role
                </button>
              </div>
              {roleDone && (
                <p className="flex items-center gap-1.5 text-sm font-semibold text-yes-green">
                  <span className="material-symbols-outlined text-[16px]">check_circle</span>
                  {roleDone}
                </p>
              )}
              {roleError && (
                <p className="rounded-xl border border-red-500/20 bg-red-500/8 px-3 py-2 text-sm text-red-500">
                  {roleError}
                </p>
              )}
            </>
          ) : (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/8 px-4 py-3 text-sm text-amber-700">
              <span className="font-bold">Your wallet is a creator but not an admin.</span>{" "}
              Run the commands below from your terminal using the deployer key to grant access.
            </div>
          )}

          <div>
            <p className="mb-1.5 text-xs font-bold uppercase tracking-widest text-slate-400">
              Terminal commands (run with deployer key)
            </p>
            <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-xl bg-slate-900 p-4 text-xs text-green-400 select-all">
{buildGrantCommands(roleTarget || "<FRIEND_ADDRESS>")}
            </pre>
          </div>

          <div className="rounded-xl border border-[rgba(116,91,255,0.1)] bg-[rgba(116,91,255,0.05)] p-4">
            <p className="mb-1 text-xs font-bold uppercase tracking-widest text-slate-400">Your wallet address</p>
            <code className="break-all font-mono text-xs text-[#745BFF]">{address}</code>
          </div>
        </div>
      )}
    </div>
  );
}
