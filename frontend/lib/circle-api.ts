// Thin typed wrappers around the /api/wallet and /api/markets Next.js routes.

// ─── Wallet API ───────────────────────────────────────────────────────────────

export async function createUser(userId: string) {
  const res = await fetch("/api/wallet", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "createUser", userId }),
  });
  return res.json();
}

export async function getUserToken(userId: string) {
  const res = await fetch("/api/wallet", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "getUserToken", userId }),
  });
  return res.json() as Promise<{ userToken: string; encryptionKey: string }>;
}

export async function initializeUser(
  userToken: string,
  blockchains = ["ARC-TESTNET"],
  accountType = "EOA"
) {
  const res = await fetch("/api/wallet", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "initializeUser", userToken, blockchains, accountType }),
  });
  return res.json() as Promise<{ challengeId?: string; code?: number }>;
}

export async function listWallets(userToken: string) {
  const res = await fetch("/api/wallet", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "listWallets", userToken }),
  });
  const data = await res.json();
  return (data.wallets ?? []) as Array<{ id: string; address: string; blockchain: string }>;
}

export async function getTokenBalance(userToken: string, walletId: string) {
  const res = await fetch("/api/wallet", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "getTokenBalance", userToken, walletId }),
  });
  const data = await res.json();
  return (data.tokenBalances ?? []) as Array<{
    token: { symbol: string; name: string };
    amount: string;
  }>;
}

// ─── Markets API (contract execution challenges) ──────────────────────────────

export async function approveUsdcChallenge(
  userToken: string,
  walletId: string,
  spender: string,
  amount: string
) {
  const res = await fetch("/api/markets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "approveUsdc", userToken, walletId, spender, amount }),
  });
  return res.json() as Promise<{ challengeId: string }>;
}

export async function buyOutcomeChallenge(
  userToken: string,
  walletId: string,
  marketAddress: string,
  isYes: boolean,
  usdcIn: string,
  minTokensOut: string
) {
  const res = await fetch("/api/markets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "buyOutcome",
      userToken,
      walletId,
      marketAddress,
      isYes,
      usdcIn,
      minTokensOut,
    }),
  });
  return res.json() as Promise<{ challengeId: string }>;
}

export async function sellOutcomeChallenge(
  userToken: string,
  walletId: string,
  marketAddress: string,
  isYes: boolean,
  tokensIn: string,
  minUsdcOut: string
) {
  const res = await fetch("/api/markets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "sellOutcome",
      userToken,
      walletId,
      marketAddress,
      isYes,
      tokensIn,
      minUsdcOut,
    }),
  });
  return res.json() as Promise<{ challengeId: string }>;
}

export async function addLiquidityChallenge(
  userToken: string,
  walletId: string,
  marketAddress: string,
  usdcIn: string
) {
  const res = await fetch("/api/markets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "addLiquidity", userToken, walletId, marketAddress, usdcIn }),
  });
  return res.json() as Promise<{ challengeId: string }>;
}

export async function redeemChallenge(
  userToken: string,
  walletId: string,
  marketAddress: string
) {
  const res = await fetch("/api/markets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "redeem", userToken, walletId, marketAddress }),
  });
  return res.json() as Promise<{ challengeId: string }>;
}

export async function createMarketChallenge(
  userToken: string,
  walletId: string,
  factoryAddress: string,
  question: string,
  category: string,
  resolutionDeadline: string,
  initialLiquidityUsdc: string
) {
  const res = await fetch("/api/markets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "createMarket",
      userToken,
      walletId,
      factoryAddress,
      question,
      category,
      resolutionDeadline,
      initialLiquidityUsdc,
    }),
  });
  return res.json() as Promise<{ challengeId: string }>;
}

export async function grantMarketCreatorChallenge(
  userToken: string,
  walletId: string,
  factoryAddress: string,
  targetAddress: string
) {
  const res = await fetch("/api/markets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "grantMarketCreator",
      userToken,
      walletId,
      factoryAddress,
      targetAddress,
    }),
  });
  return res.json() as Promise<{ challengeId: string }>;
}

export async function revokeMarketCreatorChallenge(
  userToken: string,
  walletId: string,
  factoryAddress: string,
  targetAddress: string
) {
  const res = await fetch("/api/markets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "revokeMarketCreator",
      userToken,
      walletId,
      factoryAddress,
      targetAddress,
    }),
  });
  return res.json() as Promise<{ challengeId: string }>;
}
