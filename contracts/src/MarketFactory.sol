// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC20} from "./interfaces/IERC20.sol";
import {PredictionMarket} from "./PredictionMarket.sol";
import {PriceRouter} from "./PriceRouter.sol";

/// @title MarketFactory
/// @notice Deploys PredictionMarket instances and maintains a registry.
///         Uses OpenZeppelin AccessControl for permissioned market creation.
///         DEFAULT_ADMIN_ROLE can grant/revoke MARKET_CREATOR_ROLE.
///         MARKET_CREATOR_ROLE can call createMarket.
///         Each market can optionally be linked to a Chainlink price feed via PriceRouter.
contract MarketFactory is AccessControl {
    // ─── Roles ────────────────────────────────────────────────────────────────

    bytes32 public constant MARKET_CREATOR_ROLE = keccak256("MARKET_CREATOR_ROLE");

    // ─── State ────────────────────────────────────────────────────────────────

    IERC20 public immutable collateral;
    PriceRouter public priceRouter;

    address[] public allMarkets;

    struct MarketInfo {
        string  question;
        string  category;
        uint256 createdAt;
        uint256 resolutionDeadline;
        address priceFeed; // Chainlink feed address this market tracks (address(0) if none)
    }

    mapping(address => MarketInfo) public marketInfo;
    mapping(address => bool) public isMarket;
    mapping(address => uint256) private marketIndex;

    // ─── Events ───────────────────────────────────────────────────────────────

    event MarketCreated(
        address indexed market,
        string  question,
        string  category,
        uint256 resolutionDeadline,
        address indexed priceFeed,
        address indexed creator
    );
    event MarketDeleted(address indexed market, address indexed deletedBy, uint256 collateralRefunded);
    event MarketRemoved(address indexed market, address indexed removedBy);
    event RouterUpdated(address indexed oldRouter, address indexed newRouter);

    // ─── Errors ───────────────────────────────────────────────────────────────

    error ZeroLiquidity();
    error InvalidDeadline();
    error UnknownMarket();
    error ERC20TransferFailed();

    // ─── Constructor ──────────────────────────────────────────────────────────

    /// @param _collateral  ERC20 collateral token (USDC, EURC, …)
    /// @param _priceRouter PriceRouter address (pass address(0) to disable routing)
    constructor(address _collateral, address _priceRouter) {
        collateral = IERC20(_collateral);
        priceRouter = PriceRouter(_priceRouter);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MARKET_CREATOR_ROLE, msg.sender);
    }

    // ─── Role management ─────────────────────────────────────────────────────

    function grantMarketCreator(address user) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(MARKET_CREATOR_ROLE, user);
    }

    function revokeMarketCreator(address user) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _revokeRole(MARKET_CREATOR_ROLE, user);
    }

    // ─── Market creation ──────────────────────────────────────────────────────

    /// @notice Deploy a new prediction market.
    ///         Caller must have MARKET_CREATOR_ROLE and have approved this factory
    ///         to spend `initialLiquidity` collateral tokens.
    ///         If a priceFeed is provided and PriceRouter is set, the market is
    ///         automatically registered in the router.
    ///
    /// @param question           Human-readable question
    /// @param category           "DEPEG" or "HACK"
    /// @param resolutionDeadline Unix timestamp
    /// @param initialLiquidity   Collateral (6 decimals) to seed the AMM pool
    /// @param priceFeed          Chainlink feed address this market tracks.
    ///                           Pass address(0) if not linked to a feed.
    function createMarket(
        string calldata question,
        string calldata category,
        uint256 resolutionDeadline,
        uint256 initialLiquidity,
        address priceFeed
    ) external onlyRole(MARKET_CREATOR_ROLE) returns (address market) {
        if (initialLiquidity == 0) revert ZeroLiquidity();
        if (resolutionDeadline <= block.timestamp) revert InvalidDeadline();

        if (!collateral.transferFrom(msg.sender, address(this), initialLiquidity)) {
            revert ERC20TransferFailed();
        }

        PredictionMarket pm = new PredictionMarket(
            msg.sender,
            address(collateral),
            question,
            category,
            resolutionDeadline,
            initialLiquidity
        );
        market = address(pm);

        if (!collateral.transfer(market, initialLiquidity)) {
            revert ERC20TransferFailed();
        }

        allMarkets.push(market);
        isMarket[market]    = true;
        marketIndex[market] = allMarkets.length - 1;
        marketInfo[market]  = MarketInfo({
            question:           question,
            category:           category,
            createdAt:          block.timestamp,
            resolutionDeadline: resolutionDeadline,
            priceFeed:          priceFeed
        });

        // Register in PriceRouter if feed is provided and router is set
        if (priceFeed != address(0) && address(priceRouter) != address(0)) {
            try priceRouter.registerMarket(priceFeed, market) {} catch {}
        }

        emit MarketCreated(market, question, category, resolutionDeadline, priceFeed, msg.sender);
    }

    /// @notice Update the PriceRouter address. Use address(0) to disable routing.
    function setPriceRouter(address newRouter) external onlyRole(DEFAULT_ADMIN_ROLE) {
        emit RouterUpdated(address(priceRouter), newRouter);
        priceRouter = PriceRouter(newRouter);
    }

    function removeMarket(address market) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _removeMarketFromRegistry(market);
        emit MarketRemoved(market, msg.sender);
    }

    function deleteMarket(address market) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (!isMarket[market]) revert UnknownMarket();
        uint256 collateralRefunded = PredictionMarket(payable(market)).deleteAndRefundOwner();
        _removeMarketFromRegistry(market);
        emit MarketDeleted(market, msg.sender, collateralRefunded);
    }

    function _removeMarketFromRegistry(address market) internal {
        if (!isMarket[market]) revert UnknownMarket();

        address priceFeed = marketInfo[market].priceFeed;
        uint256 index = marketIndex[market];
        uint256 lastIndex = allMarkets.length - 1;

        if (index != lastIndex) {
            address lastMarket = allMarkets[lastIndex];
            allMarkets[index] = lastMarket;
            marketIndex[lastMarket] = index;
        }

        allMarkets.pop();
        delete marketIndex[market];
        delete marketInfo[market];
        isMarket[market] = false;

        if (priceFeed != address(0) && address(priceRouter) != address(0)) {
            try priceRouter.unregisterMarket(market) {} catch {}
        }
    }

    // ─── Registry views ───────────────────────────────────────────────────────

    function getMarketCount() external view returns (uint256) {
        return allMarkets.length;
    }

    function getMarkets(uint256 offset, uint256 limit)
        external
        view
        returns (address[] memory markets)
    {
        uint256 total = allMarkets.length;
        if (offset >= total) return new address[](0);
        uint256 end = offset + limit;
        if (end > total) end = total;
        uint256 count = end - offset;
        markets = new address[](count);
        for (uint256 i = 0; i < count; i++) {
            markets[i] = allMarkets[offset + i];
        }
    }

    function getMarketInfo(address market)
        external
        view
        returns (MarketInfo memory)
    {
        return marketInfo[market];
    }
}
