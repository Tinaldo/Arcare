#!/usr/bin/env bash
# simulate-depeg.sh — Simulate a stablecoin depeg via the DepegResolver state machine.
#
# Usage:
#   PRIVATE_KEY=0x<key> ./simulate-depeg.sh <MARKET_ADDRESS>
#
# How it works:
#   Sends a Level-2 depeg price ($0.85) to DepegResolver.evaluate() twice,
#   separated by one Arc block (~3 s). The resolver's internal state machine
#   tracks the depeg window and auto-resolves the market YES once the block
#   threshold is met (Level 2 requires 3 blocks, but startBlock=N and second
#   call at N+1 means N+1-N=1 which is < 3 — so we use Level 3 ($0.70) that
#   only requires 1 block for an instant demo).
#
# Requirements:
#   The market MUST have been created via DepegResolver.createMarket() so that
#   DepegResolver is the market owner and can call resolve() internally.

set -euo pipefail

# ── Config ──────────────────────────────────────────────────────────────────
RPC="https://rpc.testnet.arc.network"
PRICE_ROUTER="0x1C8e068f22bcD1349003eDB048B8BCAe6c2257F6"
DEPEG_RESOLVER="0x46ca2EEC0188AeB4AA5Aff89829A61f0c2e9F591"

# Level-3 depeg price: $0.70 — requires only 1 block (instant for demos)
DEPEG_PRICE=70000000

CAST="/c/Users/gaspa/.foundry/bin/cast.exe"

# ── Input validation ─────────────────────────────────────────────────────────
if [[ -z "${1:-}" ]]; then
  echo "Usage: PRIVATE_KEY=0x<key> ./simulate-depeg.sh <MARKET_ADDRESS>"
  exit 1
fi
if [[ -z "${PRIVATE_KEY:-}" ]]; then
  echo "Error: PRIVATE_KEY env var is required."
  exit 1
fi

MARKET="$1"
WALLET=$($CAST wallet address --private-key "$PRIVATE_KEY")

echo ""
echo "=== InsurArc Depeg Simulation ==="
echo "Market:          $MARKET"
echo "DepegResolver:   $DEPEG_RESOLVER"
echo "Simulated price: \$0.70 (Level 3 — 1-block threshold)"
echo ""

# ── Check already resolved ────────────────────────────────────────────────────
RESOLVED=$($CAST call "$MARKET" "resolved()(bool)" --rpc-url "$RPC")
if [[ "$RESOLVED" == "true" ]]; then
  echo "Market is already resolved — nothing to do."
  exit 0
fi

# ── Verify market owner = DepegResolver ──────────────────────────────────────
OWNER=$($CAST call "$MARKET" "owner()(address)" --rpc-url "$RPC")
OWNER_LC=$(echo "$OWNER" | tr '[:upper:]' '[:lower:]')
RESOLVER_LC=$(echo "$DEPEG_RESOLVER" | tr '[:upper:]' '[:lower:]')

if [[ "$OWNER_LC" != "$RESOLVER_LC" ]]; then
  echo "Error: this market's owner is $OWNER"
  echo "       expected DepegResolver ($DEPEG_RESOLVER)"
  echo ""
  echo "Only markets created via DepegResolver.createMarket() can be"
  echo "resolved through the depeg state machine."
  echo "Create a new market from the admin page (DEPEG category) and try again."
  exit 1
fi

# ── Resolve feed address ──────────────────────────────────────────────────────
echo "→ Looking up price feed for market..."
FEED=$($CAST call "$PRICE_ROUTER" "feedByMarket(address)(address)" "$MARKET" --rpc-url "$RPC")

if [[ "$FEED" == "0x0000000000000000000000000000000000000000" ]]; then
  echo "Error: market not registered in PriceRouter."
  exit 1
fi

echo "  Feed: $FEED"
echo ""

# ── Call 1: open the depeg window ─────────────────────────────────────────────
echo "→ Call 1/2: opening depeg window (price = \$0.70)..."
TX1=$($CAST send "$DEPEG_RESOLVER" \
  "evaluate(address,int256)" "$FEED" "$DEPEG_PRICE" \
  --rpc-url "$RPC" --private-key "$PRIVATE_KEY" \
  --json 2>&1 | grep -o '"transactionHash":"[^"]*"' | head -1)
echo "  $TX1"
echo "  Depeg window opened. Waiting for next block (~4 s)..."

# ── Wait one Arc block ────────────────────────────────────────────────────────
sleep 4

# ── Call 2: confirm threshold, trigger resolution ─────────────────────────────
echo ""
echo "→ Call 2/2: confirming depeg (block threshold met → DepegResolver resolves YES)..."
TX2=$($CAST send "$DEPEG_RESOLVER" \
  "evaluate(address,int256)" "$FEED" "$DEPEG_PRICE" \
  --rpc-url "$RPC" --private-key "$PRIVATE_KEY" \
  --json 2>&1 | grep -o '"transactionHash":"[^"]*"' | head -1)
echo "  $TX2"

# ── Verify ────────────────────────────────────────────────────────────────────
echo ""
echo "→ Final market state:"
RESOLVED=$($CAST call "$MARKET" "resolved()(bool)" --rpc-url "$RPC")
YES_WINS=$($CAST call "$MARKET" "yesWins()(bool)" --rpc-url "$RPC")
echo "  resolved = $RESOLVED"
echo "  yesWins  = $YES_WINS"
echo ""

if [[ "$RESOLVED" == "true" && "$YES_WINS" == "true" ]]; then
  echo "✓ Market resolved YES — depeg simulation successful!"
else
  echo "⚠ Not yet resolved. Try running the script once more."
fi
echo ""
