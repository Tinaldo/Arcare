// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {IERC20} from "./interfaces/IERC20.sol";
import {PredictionMarket} from "./PredictionMarket.sol";

/// @title MarketFactory
/// @notice Deploys PredictionMarket instances and maintains a registry.
///         The deployer becomes the owner of all markets (for resolution).
contract MarketFactory {
    // ─── State ────────────────────────────────────────────────────────────────

    address public owner;
    IERC20 public immutable usdc;

    address[] public allMarkets;

    struct MarketInfo {
        string question;
        string category;
        uint256 createdAt;
        uint256 resolutionDeadline;
    }

    mapping(address => MarketInfo) public marketInfo;
    mapping(address => bool) public isMarket;

    // ─── Events ───────────────────────────────────────────────────────────────

    event MarketCreated(
        address indexed market,
        string question,
        string category,
        uint256 resolutionDeadline,
        address indexed creator
    );

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // ─── Errors ───────────────────────────────────────────────────────────────

    error NotOwner();
    error ZeroLiquidity();
    error InvalidDeadline();

    // ─── Constructor ──────────────────────────────────────────────────────────

    /// @param _usdc USDC token address on Arc Testnet
    ///              (native USDC: 0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359 on Arc mainnet)
    ///              Use the correct testnet address from Circle docs.
    constructor(address _usdc) {
        owner = msg.sender;
        usdc = IERC20(_usdc);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    // ─── Market creation ──────────────────────────────────────────────────────

    /// @notice Deploy a new prediction market.
    ///         Caller must have approved this factory to spend `initialLiquidityUsdc` USDC.
    ///
    /// @param question              Human-readable question, e.g. "Will USDC depeg below $0.99 by Dec 31, 2025?"
    /// @param category              "DEPEG" or "HACK"
    /// @param resolutionDeadline    Unix timestamp; resolution expected by this date
    /// @param initialLiquidityUsdc  USDC (6 decimals) to seed the AMM pool
    /// @return market               Address of the newly deployed PredictionMarket
    function createMarket(
        string calldata question,
        string calldata category,
        uint256 resolutionDeadline,
        uint256 initialLiquidityUsdc
    ) external returns (address market) {
        if (initialLiquidityUsdc == 0) revert ZeroLiquidity();
        if (resolutionDeadline <= block.timestamp) revert InvalidDeadline();

        // Pull liquidity from caller before deploying (avoids reentrancy with deploy)
        usdc.transferFrom(msg.sender, address(this), initialLiquidityUsdc);

        // Deploy market contract
        PredictionMarket pm = new PredictionMarket(
            msg.sender,          // market owner (can resolve)
            address(usdc),
            question,
            category,
            resolutionDeadline,
            initialLiquidityUsdc
        );
        market = address(pm);

        // Forward the initial liquidity to the market
        usdc.transfer(market, initialLiquidityUsdc);

        // Register
        allMarkets.push(market);
        isMarket[market] = true;
        marketInfo[market] = MarketInfo({
            question: question,
            category: category,
            createdAt: block.timestamp,
            resolutionDeadline: resolutionDeadline
        });

        emit MarketCreated(market, question, category, resolutionDeadline, msg.sender);
    }

    // ─── Registry views ───────────────────────────────────────────────────────

    function getMarketCount() external view returns (uint256) {
        return allMarkets.length;
    }

    /// @notice Paginated market list. Returns up to `limit` addresses starting at `offset`.
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

    /// @notice Returns all market info for a given market address.
    function getMarketInfo(address market)
        external
        view
        returns (MarketInfo memory)
    {
        return marketInfo[market];
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    function transferOwnership(address newOwner) external onlyOwner {
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
}
