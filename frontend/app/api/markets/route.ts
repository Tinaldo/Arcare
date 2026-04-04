import { NextResponse } from "next/server";

const CIRCLE_BASE_URL =
  process.env.NEXT_PUBLIC_CIRCLE_BASE_URL ?? "https://api.circle.com";
const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY as string;
const ARC_USDC = process.env.NEXT_PUBLIC_ARC_USDC_ADDRESS as string;

// Helper: create a contractExecution challenge via Circle API
async function contractExecution(
  userToken: string,
  walletId: string,
  contractAddress: string,
  abiFunctionSignature: string,
  abiParameters: (string | boolean)[],
  blockchain = "ARC-TESTNET"
) {
  const res = await fetch(
    `${CIRCLE_BASE_URL}/v1/w3s/user/transactions/contractExecution`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CIRCLE_API_KEY}`,
        "X-User-Token": userToken,
      },
      body: JSON.stringify({
        idempotencyKey: crypto.randomUUID(),
        walletId,
        contractAddress,
        abiFunctionSignature,
        abiParameters,
        fee: { type: "level", config: { feeLevel: "MEDIUM" } },
        blockchain,
      }),
    }
  );
  const data = await res.json();
  if (!res.ok) throw { status: res.status, data };
  return data.data as { challengeId: string };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, userToken, walletId, ...params } = body ?? {};

    if (!action || !userToken || !walletId) {
      return NextResponse.json(
        { error: "Missing action, userToken, or walletId" },
        { status: 400 }
      );
    }

    switch (action) {
      // ── USDC approval ──────────────────────────────────────────────────────
      case "approveUsdc": {
        const { spender, amount } = params;
        const result = await contractExecution(
          userToken,
          walletId,
          ARC_USDC,
          "approve(address,uint256)",
          [spender, amount]
        );
        return NextResponse.json(result);
      }

      // ── Buy outcome tokens ─────────────────────────────────────────────────
      case "buyOutcome": {
        const { marketAddress, isYes, usdcIn, minTokensOut = "0" } = params;
        const result = await contractExecution(
          userToken,
          walletId,
          marketAddress,
          "buyOutcome(bool,uint256,uint256)",
          [isYes, usdcIn, minTokensOut]
        );
        return NextResponse.json(result);
      }

      // ── Sell outcome tokens ────────────────────────────────────────────────
      case "sellOutcome": {
        const { marketAddress, isYes, tokensIn, minUsdcOut = "0" } = params;
        const result = await contractExecution(
          userToken,
          walletId,
          marketAddress,
          "sellOutcome(bool,uint256,uint256)",
          [isYes, tokensIn, minUsdcOut]
        );
        return NextResponse.json(result);
      }

      // ── Add liquidity ──────────────────────────────────────────────────────
      case "addLiquidity": {
        const { marketAddress, usdcIn } = params;
        const result = await contractExecution(
          userToken,
          walletId,
          marketAddress,
          "addLiquidity(uint256)",
          [usdcIn]
        );
        return NextResponse.json(result);
      }

      // ── Remove liquidity ───────────────────────────────────────────────────
      case "removeLiquidity": {
        const { marketAddress, shares } = params;
        const result = await contractExecution(
          userToken,
          walletId,
          marketAddress,
          "removeLiquidity(uint256)",
          [shares]
        );
        return NextResponse.json(result);
      }

      // ── Redeem winning tokens ──────────────────────────────────────────────
      case "redeem": {
        const { marketAddress } = params;
        const result = await contractExecution(
          userToken,
          walletId,
          marketAddress,
          "redeem()",
          []
        );
        return NextResponse.json(result);
      }

      // ── Create market (factory call) ───────────────────────────────────────
      case "createMarket": {
        const {
          factoryAddress,
          question,
          category,
          resolutionDeadline,
          initialLiquidityUsdc,
          priceFeed = "0x0000000000000000000000000000000000000000",
        } =
          params;
        const result = await contractExecution(
          userToken,
          walletId,
          factoryAddress,
          "createMarket(string,string,uint256,uint256,address)",
          [question, category, resolutionDeadline, initialLiquidityUsdc, priceFeed]
        );
        return NextResponse.json(result);
      }

      // ── Grant MARKET_CREATOR_ROLE ──────────────────────────────────────────
      case "grantMarketCreator": {
        const { factoryAddress, targetAddress } = params;
        const result = await contractExecution(
          userToken,
          walletId,
          factoryAddress,
          "grantMarketCreator(address)",
          [targetAddress]
        );
        return NextResponse.json(result);
      }

      // ── Revoke MARKET_CREATOR_ROLE ─────────────────────────────────────────
      case "revokeMarketCreator": {
        const { factoryAddress, targetAddress } = params;
        const result = await contractExecution(
          userToken,
          walletId,
          factoryAddress,
          "revokeMarketCreator(address)",
          [targetAddress]
        );
        return NextResponse.json(result);
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err: unknown) {
    if (err && typeof err === "object" && "status" in err && "data" in err) {
      const e = err as { status: number; data: unknown };
      return NextResponse.json(e.data, { status: e.status });
    }
    console.error("/api/markets error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
