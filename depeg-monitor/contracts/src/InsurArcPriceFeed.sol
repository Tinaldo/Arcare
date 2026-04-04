// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IReceiver} from "./IReceiver.sol";

/**
 * @title InsurArcPriceFeed
 * @notice Receives CRE price reports and owns all depeg / resolution logic.
 *
 * The CRE workflow is a pure data pipeline: it fetches stablecoin prices
 * off-chain (CoinGecko) and pushes them here every hour via onReport().
 * This contract decides whether a depeg has occurred and triggers resolution.
 *
 * Report payload: ABI-encoded (uint256 marketId, uint256 price)
 * price is 8-decimal fixed-point (Chainlink standard):
 *   1.00 USD  → 100_000_000
 *   0.97 USD  →  97_000_000
 *   0.958 USD →  95_800_000
 */
contract InsurArcPriceFeed is IReceiver {

    // ── Constants ──────────────────────────────────────────────────────────
    /// @notice Depeg threshold: 0.97 USD in 8-decimal fixed-point
    uint256 public constant DEPEG_THRESHOLD = 97_000_000;

    // ── Events ─────────────────────────────────────────────────────────────
    event PriceUpdated(uint256 indexed marketId, uint256 price, uint256 timestamp);
    event DepegDetected(uint256 indexed marketId, uint256 price, uint256 timestamp);
    event ResolutionTriggered(uint256 indexed marketId, uint256 price, uint256 timestamp);

    // ── State ──────────────────────────────────────────────────────────────
    struct PriceData {
        uint256 price;
        uint256 updatedAt;
    }

    mapping(uint256 => PriceData)  public prices;
    mapping(uint256 => bool)       public resolvedMarkets;

    address public immutable forwarder;

    // ── Constructor ────────────────────────────────────────────────────────
    constructor(address _forwarder) {
        require(_forwarder != address(0), "InsurArcPriceFeed: zero forwarder");
        forwarder = _forwarder;
    }

    // ── IReceiver ──────────────────────────────────────────────────────────

    /**
     * @notice Called by the CRE DON forwarder every hour with a fresh price.
     * @param  metadata  CRE metadata (not used here)
     * @param  report    ABI-encoded (uint256 marketId, uint256 price)
     */
    function onReport(bytes calldata metadata, bytes calldata report) external override {
        require(msg.sender == forwarder, "InsurArcPriceFeed: caller not forwarder");

        (uint256 marketId, uint256 price) = abi.decode(report, (uint256, uint256));

        // Store latest price
        prices[marketId] = PriceData({ price: price, updatedAt: block.timestamp });
        emit PriceUpdated(marketId, price, block.timestamp);

        // Depeg detection and resolution live here — not in the workflow
        if (price < DEPEG_THRESHOLD && !resolvedMarkets[marketId]) {
            emit DepegDetected(marketId, price, block.timestamp);
            _triggerResolution(marketId, price);
        }
    }

    // ── View ───────────────────────────────────────────────────────────────

    function latestPrice(uint256 marketId)
        external view
        returns (uint256 price, uint256 updatedAt)
    {
        PriceData memory d = prices[marketId];
        return (d.price, d.updatedAt);
    }

    function isResolved(uint256 marketId) external view returns (bool) {
        return resolvedMarkets[marketId];
    }

    // ── Internal ───────────────────────────────────────────────────────────

    function _triggerResolution(uint256 marketId, uint256 price) internal {
        resolvedMarkets[marketId] = true;
        emit ResolutionTriggered(marketId, price, block.timestamp);

        // TODO: call Arc insurance pool to settle claims
        // e.g. IInsurArcPool(pool).settleMarket(marketId, price);
    }

    // ── IERC165 ────────────────────────────────────────────────────────────

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IReceiver).interfaceId;
    }
}
