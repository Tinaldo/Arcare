"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui/Spinner";
import { useWallet } from "@/components/wallet/WalletContext";
import { arcClient, parseUsdc } from "@/lib/arc-client";
import { MARKET_FACTORY_ABI } from "@/lib/abis";
import { MARKET_FACTORY_ADDRESS } from "@/lib/addresses";
import {
  approveUsdcChallenge,
  createMarketChallenge,
  grantMarketCreatorChallenge,
  revokeMarketCreatorChallenge,
} from "@/lib/circle-api";

// keccak256("MARKET_CREATOR_ROLE") — matches the contract constant
const MARKET_CREATOR_ROLE =
  "0x4a4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e" as `0x${string}`;

type Roles = { isAdmin: boolean; isCreator: boolean };

export default function AdminPage() {
  const walletState = useWallet();
  const { isConnected, wallet, userToken, openModal, executeChallenge, refreshBalance } =
    walletState;
  const router = useRouter();

  const { sdkReady } = walletState;
  const [roles, setRoles] = useState<Roles | null>(null);
  const [creatorRoleHash, setCreatorRoleHash] = useState<`0x${string}` | null>(null);
  const [adminRoleHash, setAdminRoleHash] = useState<`0x${string}` | null>(null);
  const [loadingRoles, setLoadingRoles] = useState(false);

  // Create market form
  const [question, setQuestion] = useState("");
  const [category, setCategory] = useState<"DEPEG" | "HACK">("DEPEG");
  const [deadline, setDeadline] = useState("");
  const [liquidity, setLiquidity] = useState("10");
  const [createStep, setCreateStep] = useState<string | null>(null);
  const [createError, setCreateError] = useState("");
  const [createDone, setCreateDone] = useState(false);

  // Role management form
  const [roleTarget, setRoleTarget] = useState("");
  const [roleStep, setRoleStep] = useState<string | null>(null);
  const [roleError, setRoleError] = useState("");
  const [roleDone, setRoleDone] = useState("");

  const loadRoles = useCallback(async () => {
    if (!wallet || MARKET_FACTORY_ADDRESS === "0x0") return;
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
          args: [creatorRole, wallet.address as `0x${string}`],
        }) as Promise<boolean>,
        arcClient.readContract({
          address: MARKET_FACTORY_ADDRESS,
          abi: MARKET_FACTORY_ABI,
          functionName: "hasRole",
          args: [adminRole, wallet.address as `0x${string}`],
        }) as Promise<boolean>,
      ]);
      setRoles({ isAdmin, isCreator });
    } catch {
      setRoles({ isAdmin: false, isCreator: false });
    } finally {
      setLoadingRoles(false);
    }
  }, [wallet]);

  useEffect(() => {
    if (isConnected) void loadRoles();
  }, [isConnected, loadRoles]);

  // ── Create Market ─────────────────────────────────────────────────────────

  const handleCreateMarket = async () => {
    if (!wallet || !userToken) { openModal(); return; }
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
      setCreateStep("Step 1 of 2: Approve USDC...");
      const approveCh = await approveUsdcChallenge(
        userToken, wallet.id, MARKET_FACTORY_ADDRESS, liqUsdc.toString()
      );
      if (!approveCh.challengeId) {
        const msg = (approveCh as unknown as { message?: string; error?: string }).message
          ?? (approveCh as unknown as { message?: string; error?: string }).error
          ?? "Approval failed — check your USDC balance";
        throw new Error(msg);
      }
      await executeChallenge(approveCh.challengeId);

      setCreateStep("Step 2 of 2: Creating market...");
      const createCh = await createMarketChallenge(
        userToken,
        wallet.id,
        MARKET_FACTORY_ADDRESS,
        question,
        category,
        deadlineTs.toString(),
        liqUsdc.toString()
      );
      if (!createCh.challengeId) {
        const msg = (createCh as unknown as { message?: string; error?: string }).message
          ?? (createCh as unknown as { message?: string; error?: string }).error
          ?? "Create market failed";
        throw new Error(msg);
      }
      await executeChallenge(createCh.challengeId);

      await refreshBalance();
      setCreateDone(true);
      setCreateStep(null);
      setQuestion("");
      setDeadline("");
      setLiquidity("10");
    } catch (e: unknown) {
      setCreateError((e as Error).message ?? "Failed to create market");
      setCreateStep(null);
    }
  };

  // ── Grant / Revoke Role ───────────────────────────────────────────────────

  const handleRole = async (action: "grant" | "revoke") => {
    if (!wallet || !userToken) { openModal(); return; }
    if (!roleTarget.startsWith("0x") || roleTarget.length !== 42) {
      setRoleError("Enter a valid 0x address");
      return;
    }
    setRoleError("");
    setRoleDone("");
    setRoleStep(`${action === "grant" ? "Granting" : "Revoking"} role...`);

    try {
      const ch = action === "grant"
        ? await grantMarketCreatorChallenge(userToken, wallet.id, MARKET_FACTORY_ADDRESS, roleTarget)
        : await revokeMarketCreatorChallenge(userToken, wallet.id, MARKET_FACTORY_ADDRESS, roleTarget);
      await executeChallenge(ch.challengeId);
      setRoleDone(`Role ${action === "grant" ? "granted to" : "revoked from"} ${roleTarget.slice(0, 10)}...`);
      setRoleTarget("");
    } catch (e: unknown) {
      setRoleError((e as Error).message ?? "Transaction failed");
    } finally {
      setRoleStep(null);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <p className="text-slate-500">Connect your wallet to access the admin dashboard.</p>
        <button onClick={() => openModal("signin")} className="arc-btn-primary px-6 py-2.5">
          Sign In
        </button>
      </div>
    );
  }

  if (MARKET_FACTORY_ADDRESS === "0x0") {
    return (
      <div className="py-20 text-center text-slate-500">
        Deploy contracts first and set <code className="text-arc-blue">NEXT_PUBLIC_MARKET_FACTORY_ADDRESS</code> in .env.local
      </div>
    );
  }

  if (loadingRoles || !roles) {
    return <div className="flex justify-center py-20"><Spinner size={32} /></div>;
  }

  if (!roles.isAdmin && !roles.isCreator) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-6 text-2xl font-bold text-slate-900">Admin Dashboard</h1>
        <div className="rounded-2xl border border-arc-border bg-white p-6 space-y-4">
          <p className="font-semibold text-slate-800">Your wallet does not have a market creator role.</p>
          <p className="text-sm text-slate-500">
            Your Circle wallet address: <code className="text-arc-blue">{wallet?.address}</code>
          </p>
          <p className="text-sm text-slate-500">
            Ask the factory admin to grant you the role, or run this command with the deployer key:
          </p>
          <pre className="overflow-x-auto rounded-xl bg-slate-900 p-4 text-xs text-green-400">
{`cast send ${MARKET_FACTORY_ADDRESS} \\
  "grantMarketCreator(address)" ${wallet?.address} \\
  --rpc-url https://rpc.testnet.arc.network \\
  --account deployer`}
          </pre>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Admin Dashboard</h1>
        <div className="flex gap-2">
          {roles.isCreator && (
            <span className="rounded-full bg-arc-blue/10 px-3 py-1 text-xs font-semibold text-arc-blue">
              Market Creator
            </span>
          )}
          {roles.isAdmin && (
            <span className="rounded-full bg-arc-purple/10 px-3 py-1 text-xs font-semibold text-arc-purple">
              Admin
            </span>
          )}
        </div>
      </div>

      {/* Create Market */}
      {roles.isCreator && (
        <div className="rounded-2xl border border-arc-border bg-white p-6 space-y-5">
          <h2 className="text-lg font-semibold text-slate-900">Create Market</h2>

          {createDone && (
            <div className="rounded-xl border border-yes-green/30 bg-yes-green/10 p-4 text-yes-green font-medium">
              Market created successfully!{" "}
              <button onClick={() => router.push("/")} className="underline">
                View markets
              </button>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Question</label>
              <input
                className="arc-input"
                placeholder="Will USDC depeg below $0.99 before Dec 31, 2026?"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Category</label>
                <select
                  className="arc-input"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as "DEPEG" | "HACK")}
                >
                  <option value="DEPEG">DEPEG</option>
                  <option value="HACK">HACK</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Resolution Date</label>
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
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Initial Liquidity (USDC)
              </label>
              <div className="flex items-center gap-2 rounded-xl border border-arc-border bg-slate-50 px-4 py-3">
                <input
                  type="number"
                  min="1"
                  className="flex-1 bg-transparent text-lg font-medium text-slate-800 outline-none placeholder:text-slate-300"
                  value={liquidity}
                  onChange={(e) => setLiquidity(e.target.value)}
                />
                <span className="text-sm text-slate-400">USDC</span>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Seeds the AMM pool. Split 50/50 between YES and NO reserves.
              </p>
            </div>
          </div>

          <button
            className="arc-btn-primary w-full py-3 gap-2"
            onClick={handleCreateMarket}
            disabled={!!createStep || !sdkReady}
          >
            {createStep ? (
              <span className="flex items-center justify-center gap-2">
                <Spinner size={16} />
                {createStep}
              </span>
            ) : "Create Market"}
          </button>

          {!sdkReady && <p className="text-xs text-slate-400">Initializing Circle SDK...</p>}
          {createError && <p className="text-sm text-red-500">{createError}</p>}
        </div>
      )}

      {/* Role Management */}
      {roles.isAdmin && (
        <div className="rounded-2xl border border-arc-border bg-white p-6 space-y-5">
          <h2 className="text-lg font-semibold text-slate-900">Role Management</h2>
          <p className="text-sm text-slate-500">
            Grant or revoke <span className="font-semibold text-slate-700">MARKET_CREATOR_ROLE</span> for any address.
          </p>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Wallet Address</label>
            <input
              className="arc-input"
              placeholder="0x..."
              value={roleTarget}
              onChange={(e) => setRoleTarget(e.target.value)}
            />
          </div>

          <div className="flex gap-3">
            <button
              className="arc-btn-primary flex-1 py-2.5 text-sm"
              onClick={() => handleRole("grant")}
              disabled={!!roleStep}
            >
              {roleStep ? <Spinner size={16} /> : "Grant Creator Role"}
            </button>
            <button
              onClick={() => handleRole("revoke")}
              disabled={!!roleStep}
              className="flex-1 rounded-xl border border-no-red py-2.5 text-sm font-semibold text-no-red hover:bg-no-red/5 transition-colors disabled:opacity-50"
            >
              Revoke Creator Role
            </button>
          </div>

          {roleDone && <p className="text-sm text-yes-green font-medium">{roleDone}</p>}
          {roleError && <p className="text-sm text-red-500">{roleError}</p>}

          <div className="rounded-xl border border-arc-border bg-slate-50 p-4">
            <p className="text-xs text-slate-500 font-medium mb-1">Your wallet address (share this to receive roles):</p>
            <code className="text-xs text-arc-blue break-all">{wallet?.address}</code>
          </div>

          {adminRoleHash && creatorRoleHash && (
            <div className="rounded-xl border border-arc-border bg-slate-50 p-4 space-y-2">
              <p className="text-xs font-medium text-slate-500 mb-2">Or use cast to manage roles directly:</p>
              <pre className="text-xs text-slate-700 overflow-x-auto whitespace-pre-wrap break-all">
{`cast send ${MARKET_FACTORY_ADDRESS} "grantMarketCreator(address)" <ADDRESS> --rpc-url https://rpc.testnet.arc.network --account deployer`}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
