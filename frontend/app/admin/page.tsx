"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui/Spinner";
import { useWallet } from "@/components/wallet/WalletContext";
import { arcClient, parseUsdc } from "@/lib/arc-client";
import { MARKET_FACTORY_ABI } from "@/lib/abis";
import { MARKET_FACTORY_ADDRESS, ARC_USDC_ADDRESS } from "@/lib/addresses";
import { useContract, ERC20_ABI } from "@/lib/use-contract";

type Roles = { isAdmin: boolean; isCreator: boolean };
type ManagedMarket = {
  address: `0x${string}`;
  question: string;
  category: string;
  resolutionDeadline: bigint;
};

function formatAdminDeadline(deadline: bigint) {
  return new Date(Number(deadline) * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function AdminPage() {
  const { isConnected, address, connect } = useWallet();
  const router = useRouter();

  const factory = useContract(MARKET_FACTORY_ADDRESS, MARKET_FACTORY_ABI);
  const usdc = useContract(ARC_USDC_ADDRESS, ERC20_ABI);

  const [roles, setRoles] = useState<Roles | null>(null);
  const [adminRoleHash, setAdminRoleHash] = useState<`0x${string}` | null>(null);
  const [creatorRoleHash, setCreatorRoleHash] = useState<`0x${string}` | null>(null);
  const [loadingRoles, setLoadingRoles] = useState(false);

  const [question, setQuestion] = useState("");
  const [category, setCategory] = useState<"DEPEG" | "HACK">("DEPEG");
  const [deadline, setDeadline] = useState("");
  const [liquidity, setLiquidity] = useState("10");
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

  const loadRoles = useCallback(async () => {
    if (!address || MARKET_FACTORY_ADDRESS === "0x0") return;
    setLoadingRoles(true);
    try {
      const [creatorRole, adminRole] = await Promise.all([
        arcClient.readContract({
          address: MARKET_FACTORY_ADDRESS,
          abi: MARKET_FACTORY_ABI,
          functionName: "MARKET_CREATOR_ROLE",
        }) as Promise<`0x${string}`>,
        arcClient.readContract({
          address: MARKET_FACTORY_ADDRESS,
          abi: MARKET_FACTORY_ABI,
          functionName: "DEFAULT_ADMIN_ROLE",
        }) as Promise<`0x${string}`>,
      ]);
      setCreatorRoleHash(creatorRole);
      setAdminRoleHash(adminRole);
      const [isCreator, isAdmin] = await Promise.all([
        arcClient.readContract({
          address: MARKET_FACTORY_ADDRESS,
          abi: MARKET_FACTORY_ABI,
          functionName: "hasRole",
          args: [creatorRole, address],
        }) as Promise<boolean>,
        arcClient.readContract({
          address: MARKET_FACTORY_ADDRESS,
          abi: MARKET_FACTORY_ABI,
          functionName: "hasRole",
          args: [adminRole, address],
        }) as Promise<boolean>,
      ]);
      setRoles({ isAdmin, isCreator });
    } catch {
      setRoles({ isAdmin: false, isCreator: false });
    } finally {
      setLoadingRoles(false);
    }
  }, [address]);

  useEffect(() => {
    if (isConnected) void loadRoles();
  }, [isConnected, loadRoles]);

  const loadManagedMarkets = useCallback(async () => {
    if (MARKET_FACTORY_ADDRESS === "0x0") return;
    setLoadingMarkets(true);
    try {
      const count = await arcClient.readContract({
        address: MARKET_FACTORY_ADDRESS,
        abi: MARKET_FACTORY_ABI,
        functionName: "getMarketCount",
      });

      if (count === 0n) {
        setManagedMarkets([]);
        return;
      }

      const addresses = (await arcClient.readContract({
        address: MARKET_FACTORY_ADDRESS,
        abi: MARKET_FACTORY_ABI,
        functionName: "getMarkets",
        args: [0n, count],
      })) as `0x${string}`[];

      const markets = await Promise.all(
        addresses.map(async (marketAddress) => {
          const info = await arcClient.readContract({
            address: MARKET_FACTORY_ADDRESS,
            abi: MARKET_FACTORY_ABI,
            functionName: "getMarketInfo",
            args: [marketAddress],
          }) as {
            question: string;
            category: string;
            createdAt: bigint;
            resolutionDeadline: bigint;
          };

          return {
            address: marketAddress,
            question: info.question,
            category: info.category,
            resolutionDeadline: info.resolutionDeadline,
          } satisfies ManagedMarket;
        })
      );

      setManagedMarkets(markets);
    } finally {
      setLoadingMarkets(false);
    }
  }, []);

  useEffect(() => {
    if (isConnected) void loadManagedMarkets();
  }, [isConnected, loadManagedMarkets]);

  const handleCreateMarket = async () => {
    if (!isConnected) { connect(); return; }
    setCreateError("");
    setCreateDone(false);
    if (!question.trim()) { setCreateError("Enter a question"); return; }
    if (!deadline) { setCreateError("Select a resolution date"); return; }
    const deadlineTs = Math.floor(new Date(deadline).getTime() / 1000);
    if (deadlineTs <= Math.floor(Date.now() / 1000)) {
      setCreateError("Deadline must be in the future");
      return;
    }
    const liqUsdc = parseUsdc(liquidity);
    if (liqUsdc === 0n) { setCreateError("Enter initial liquidity"); return; }
    try {
      setCreateStep("Step 1 of 2: Approve USDC…");
      await usdc.write("approve", [MARKET_FACTORY_ADDRESS, liqUsdc]);
      setCreateStep("Step 2 of 2: Creating market…");
      await factory.write("createMarket", [question, category, BigInt(deadlineTs), liqUsdc]);
      setCreateDone(true);
      setCreateStep(null);
      setQuestion("");
      setDeadline("");
      setLiquidity("10");
      void loadManagedMarkets();
    } catch (e: unknown) {
      setCreateError((e as Error).message ?? "Failed to create market");
      setCreateStep(null);
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
      await factory.write("removeMarket", [target]);
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
      await factory.write("deleteMarket", [target]);
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
    setRoleError("");
    setRoleDone("");
    setRoleStep(`${action === "grant" ? "Granting" : "Revoking"} role…`);
    try {
      const fn = action === "grant" ? "grantMarketCreator" : "revokeMarketCreator";
      await factory.write(fn, [roleTarget]);
      setRoleDone(`Role ${action === "grant" ? "granted to" : "revoked from"} ${roleTarget.slice(0, 10)}…`);
      setRoleTarget("");
    } catch (e: unknown) {
      setRoleError((e as Error).message ?? "Transaction failed");
    } finally {
      setRoleStep(null);
    }
  };

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <span className="material-symbols-outlined text-[48px] text-slate-300">admin_panel_settings</span>
        <p className="text-slate-500 font-medium">Connect your wallet to access the admin dashboard.</p>
        <button onClick={connect} className="arc-btn-primary px-6 py-2.5">
          Connect Wallet
        </button>
      </div>
    );
  }

  if (MARKET_FACTORY_ADDRESS === "0x0") {
    return (
      <div className="py-20 text-center text-slate-500">
        Deploy contracts first and set{" "}
        <code className="font-mono text-[#745BFF]">NEXT_PUBLIC_MARKET_FACTORY_ADDRESS</code> in .env.local
      </div>
    );
  }

  if (loadingRoles || !roles) {
    return <div className="flex justify-center py-20"><Spinner size={32} /></div>;
  }

  if (!roles.isAdmin && !roles.isCreator) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-6 text-2xl font-extrabold text-slate-900">Admin Dashboard</h1>
        <div className="glass-card p-6 space-y-4">
          <div className="flex items-center gap-2 text-slate-800 font-semibold">
            <span className="material-symbols-outlined text-[20px] text-orange-500">warning</span>
            Your wallet does not have a market creator role.
          </div>
          <p className="text-sm text-slate-500">
            Wallet: <code className="font-mono text-[#745BFF] text-xs">{address}</code>
          </p>
          <pre className="overflow-x-auto rounded-xl bg-slate-900 p-4 text-xs text-green-400 whitespace-pre-wrap break-all">
{`cast send ${MARKET_FACTORY_ADDRESS} \\
  "grantMarketCreator(address)" ${address} \\
  --rpc-url https://rpc.testnet.arc.network \\
  --account deployer`}
          </pre>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-slate-900">Admin Dashboard</h1>
        <div className="flex gap-2">
          {roles.isCreator && (
            <span className="rounded-full bg-[#745BFF]/10 px-3 py-1 text-xs font-bold text-[#745BFF]">
              Market Creator
            </span>
          )}
          {roles.isAdmin && (
            <span className="rounded-full bg-[#5b3ee5]/10 px-3 py-1 text-xs font-bold text-[#5b3ee5]">
              Admin
            </span>
          )}
        </div>
      </div>

      {/* Create Market */}
      {roles.isCreator && (
        <div className="glass-card p-6 space-y-5">
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <span className="material-symbols-outlined text-[20px] text-[#745BFF]">add_circle</span>
            Create Market
          </h2>

          {createDone && (
            <div className="flex items-center gap-2 rounded-xl border border-yes-green/30 bg-yes-green/8 p-4 text-yes-green font-semibold">
              <span className="material-symbols-outlined text-[18px]">check_circle</span>
              Market created!{" "}
              <button onClick={() => router.push("/")} className="underline ml-1">View markets</button>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">Question</label>
              <input
                className="arc-input"
                placeholder="Will USDC depeg below $0.99 before Dec 31, 2026?"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">Category</label>
                <select className="arc-input" value={category} onChange={(e) => setCategory(e.target.value as "DEPEG" | "HACK")}>
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
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">Initial Liquidity (USDC)</label>
              <div className="flex items-center gap-2 rounded-xl border border-[rgba(116,91,255,0.2)] bg-white/80 px-4 py-3">
                <input
                  type="number"
                  min="1"
                  className="flex-1 bg-transparent text-lg font-bold text-slate-800 outline-none placeholder:text-slate-300"
                  value={liquidity}
                  onChange={(e) => setLiquidity(e.target.value)}
                />
                <span className="text-sm font-semibold text-slate-400">USDC</span>
              </div>
            </div>
          </div>

          <button className="arc-btn-primary w-full py-3" onClick={handleCreateMarket} disabled={!!createStep}>
            {createStep ? (
              <span className="flex items-center justify-center gap-2"><Spinner size={16} />{createStep}</span>
            ) : "Create Market"}
          </button>
          {createError && (
            <p className="rounded-xl bg-red-500/8 border border-red-500/20 px-3 py-2 text-sm text-red-500">
              {createError}
            </p>
          )}
        </div>
      )}

      {/* Role Management */}
      {roles.isAdmin && (
        <div className="glass-card p-6 space-y-5">
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
                className="rounded-full border border-no-red px-5 py-2.5 text-sm font-bold text-no-red hover:bg-no-red/5 transition-colors disabled:opacity-50"
              >
                Delete
              </button>
              <button
                onClick={() => void handleRemoveMarket()}
                disabled={!!removeStep}
                className="rounded-full border border-slate-300 px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50"
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
                        <span>{market.category}</span>
                        <span>Deadline: {formatAdminDeadline(market.resolutionDeadline)}</span>
                      </div>
                      <code className="block break-all text-xs text-[#745BFF]">{market.address}</code>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => void handleDeleteMarket(market.address)}
                        disabled={!!removeStep}
                        className="rounded-full border border-no-red px-4 py-2 text-sm font-bold text-no-red hover:bg-no-red/5 transition-colors disabled:opacity-50"
                      >
                        Delete
                      </button>
                      <button
                        onClick={() => void handleRemoveMarket(market.address)}
                        disabled={!!removeStep}
                        className="rounded-full border border-slate-300 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50"
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
            <p className="rounded-xl bg-red-500/8 border border-red-500/20 px-3 py-2 text-sm text-red-500">
              {removeError}
            </p>
          )}
        </div>
      )}

      {roles.isAdmin && (
        <div className="glass-card p-6 space-y-5">
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <span className="material-symbols-outlined text-[20px] text-[#745BFF]">manage_accounts</span>
            Role Management
          </h2>
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">Wallet Address</label>
            <input className="arc-input" placeholder="0x…" value={roleTarget} onChange={(e) => setRoleTarget(e.target.value)} />
          </div>
          <div className="flex gap-3">
            <button className="arc-btn-primary flex-1 py-2.5 text-sm" onClick={() => handleRole("grant")} disabled={!!roleStep}>
              {roleStep ? <Spinner size={16} /> : "Grant Creator Role"}
            </button>
            <button
              onClick={() => handleRole("revoke")}
              disabled={!!roleStep}
              className="flex-1 rounded-full border border-no-red py-2.5 text-sm font-bold text-no-red hover:bg-no-red/5 transition-colors disabled:opacity-50"
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
            <p className="rounded-xl bg-red-500/8 border border-red-500/20 px-3 py-2 text-sm text-red-500">
              {roleError}
            </p>
          )}
          <div className="rounded-xl bg-[rgba(116,91,255,0.05)] border border-[rgba(116,91,255,0.1)] p-4">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">Your wallet</p>
            <code className="text-xs text-[#745BFF] break-all font-mono">{address}</code>
          </div>
          {adminRoleHash && creatorRoleHash && (
            <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-xl bg-slate-900 p-4 text-xs text-green-400">
{`cast send ${MARKET_FACTORY_ADDRESS} "grantMarketCreator(address)" <ADDRESS> --rpc-url https://rpc.testnet.arc.network --account deployer`}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
