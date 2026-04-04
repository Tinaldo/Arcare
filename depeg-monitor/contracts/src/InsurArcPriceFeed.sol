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
    /// @notice Default depeg threshold: 0.97 USD in 8-decimal fixed-point.
    ///         Per-market overrides take precedence when set.
    uint256 public constant DEPEG_THRESHOLD = 97_000_000;

    // ── Events ─────────────────────────────────────────────────────────────
    event PriceUpdated(uint256 indexed marketId, uint256 price, uint256 timestamp);
    event DepegDetected(uint256 indexed marketId, string asset, uint256 price, uint256 threshold, uint256 timestamp);
    event ResolutionTriggered(uint256 indexed marketId, uint256 price, uint256 timestamp);
    event MarketThresholdSet(uint256 indexed marketId, uint256 threshold);
    event MarketAssetSet(uint256 indexed marketId, string asset);

    // ── State ──────────────────────────────────────────────────────────────
    struct PriceData {
        uint256 price;
        uint256 updatedAt;
    }

    mapping(uint256 => PriceData)  public prices;
    mapping(uint256 => bool)       public resolvedMarkets;
    /// @notice Per-market depeg threshold override (8-decimal, same as DEPEG_THRESHOLD).
    ///         0 means "use the default DEPEG_THRESHOLD".
    mapping(uint256 => uint256)    public marketThresholds;
    /// @notice Human-readable asset symbol tracked by each market (e.g. "USDC", "EURC").
    mapping(uint256 => string)     public marketAsset;

    address public immutable forwarder;
    address public owner;

    // ── Modifiers ──────────────────────────────────────────────────────────
    modifier onlyOwner() {
        require(msg.sender == owner, "InsurArcPriceFeed: not owner");
        _;
    }

    // ── Constructor ────────────────────────────────────────────────────────
    constructor(address _forwarder) {
        require(_forwarder != address(0), "InsurArcPriceFeed: zero forwarder");
        forwarder = _forwarder;
        owner = msg.sender;
    }

    // ── Admin ──────────────────────────────────────────────────────────────

    /// @notice Set a per-market depeg threshold (8-decimal fixed-point).
    ///         Pass 0 to revert to the global DEPEG_THRESHOLD default.
    function setMarketThreshold(uint256 marketId, uint256 threshold) external onlyOwner {
        marketThresholds[marketId] = threshold;
        emit MarketThresholdSet(marketId, threshold);
    }

    /// @notice Set the asset symbol for a market (for off-chain indexing).
    function setMarketAsset(uint256 marketId, string calldata asset) external onlyOwner {
        marketAsset[marketId] = asset;
        emit MarketAssetSet(marketId, asset);
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

        // Use per-market override threshold if set, otherwise fall back to global default
        uint256 threshold = marketThresholds[marketId] != 0
            ? marketThresholds[marketId]
            : DEPEG_THRESHOLD;

        // Depeg detection and resolution live here — not in the workflow
        if (price < threshold && !resolvedMarkets[marketId]) {
            emit DepegDetected(marketId, marketAsset[marketId], price, threshold, block.timestamp);
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
