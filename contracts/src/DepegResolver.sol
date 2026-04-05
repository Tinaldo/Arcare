// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "./interfaces/IERC20.sol";
import {IMarketFactory} from "./interfaces/IMarketFactory.sol";
import {IPriceRouter} from "./interfaces/IPriceRouter.sol";
import {IPredictionMarket} from "./interfaces/IPredictionMarket.sol";

/// @title DepegResolver
/// @notice Tracks stablecoin price depegs across multiple severity levels and
///         automatically resolves prediction markets when the block requirement is met.
///
///         Markets MUST be created through this contract so that DepegResolver
///         becomes the PredictionMarket owner and can call resolve().
///
///         Off-chain keeper flow (TypeScript):
///           1. Call latestRoundData() on the Chainlink feed on Sepolia (free, off-chain)
///           2. Call evaluate(feedAddress, price) on Arc Testnet
///           3. DepegResolver fetches all markets for that feed from PriceRouter
///              and runs the state machine for each one.
///
///         Depeg levels (Chainlink 8-decimal price):
///           Level 0: price < $0.97  →  20 blocks (~4 min at 12 s/block)
///           Level 1: price < $0.95  →  10 blocks (~2 min)
///           Level 2: price < $0.90  →   3 blocks (~36 sec)
///           Level 3: price < $0.80  →   1 block  (immediate next call)
///
///         Rules:
///           - Level never downgrades once set (partial recovery keeps the active level)
///           - Escalation to a more severe level resets the block counter
///           - Recovery above $0.97 before the block requirement clears the state
contract DepegResolver is Ownable {

    // ─── Types ────────────────────────────────────────────────────────────────

    struct LevelConfig {
        uint256 threshold;      // 8-decimal Chainlink price (e.g. 97_000_000 = $0.97)
        uint64  requiredBlocks; // Blocks the depeg must persist before resolution
    }

    /// @dev Packed into a single storage slot (bool + uint8 + uint64 = 10 bytes).
    struct DepegState {
        uint8   level;      // Active depeg level (0–3)
        uint64  startBlock; // Block when the current level was first entered
        bool    active;     // Whether a depeg window is open for this market
    }

    // ─── Constants ────────────────────────────────────────────────────────────

    /// @notice Price at or above which depeg state is cleared (Chainlink 8 decimals).
    uint256 public constant RECOVERY_THRESHOLD = 97_000_000; // $0.97

    // ─── State ────────────────────────────────────────────────────────────────

    /// @notice Depeg level configurations. Index 0 = least severe, 3 = most severe.
    LevelConfig[4] public levels;

    /// @notice Depeg tracking state per market address.
    mapping(address => DepegState) public depegStates;

    /// @notice Last price submitted to evaluate() for a given market (8 Chainlink decimals).
    ///         Updated on every evaluate() / onReport() call. Readable by the frontend
    ///         so it always reflects the price the state machine actually sees.
    mapping(address => uint256) public lastMarketPrice;

    IMarketFactory public immutable factory;
    IPriceRouter   public immutable router;
    IERC20         public immutable usdc;

    // ─── Events ───────────────────────────────────────────────────────────────

    event DepegDetected(address indexed market, uint8 level, uint256 price, uint256 blockNumber);
    event DepegEscalated(address indexed market, uint8 newLevel, uint256 price, uint256 blockNumber);
    event DepegCleared(address indexed market, uint256 price);
    event MarketResolved(address indexed market, bool yesWins, uint256 blockNumber);
    event LevelConfigUpdated(uint8 indexed levelIdx, uint256 threshold, uint64 requiredBlocks);

    // ─── Errors ───────────────────────────────────────────────────────────────

    error InvalidPrice();
    error InvalidLevelIndex();
    error NoLiquidityToWithdraw();

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(address _factory, address _router, address _usdc) Ownable(msg.sender) {
        factory = IMarketFactory(_factory);
        router  = IPriceRouter(_router);
        usdc    = IERC20(_usdc);

        levels[0] = LevelConfig({threshold: 97_000_000, requiredBlocks: 20});
        levels[1] = LevelConfig({threshold: 95_000_000, requiredBlocks: 10});
        levels[2] = LevelConfig({threshold: 90_000_000, requiredBlocks:  3});
        levels[3] = LevelConfig({threshold: 80_000_000, requiredBlocks:  1});
    }

    // ─── Core ─────────────────────────────────────────────────────────────────

    /// @notice Submit a Chainlink price for a feed. Called by the off-chain keeper.
    ///         Fetches all markets registered under `feed` from PriceRouter and
    ///         runs the depeg state machine on each unresolved market.
    /// @param feed  Chainlink feed address (used as the key in PriceRouter's registry)
    /// @param price latestRoundData().answer — must be positive (8 Chainlink decimals)
    function evaluate(address feed, int256 price) external {
        if (price <= 0) revert InvalidPrice();
        _processEvaluation(feed, uint256(price));
    }

    /// @notice CRE DON entry-point. Called by the Chainlink DON forwarder with an
    ///         ABI-encoded (address feed, int256 price) payload in `report`.
    ///         Silently skips invalid prices so a bad report never reverts the DON tx.
    function onReport(bytes calldata, bytes calldata report) external {
        (address feed, int256 price) = abi.decode(report, (address, int256));
        if (price <= 0) return;
        _processEvaluation(feed, uint256(price));
    }

    function _processEvaluation(address feed, uint256 p) internal {
        address[] memory markets = router.getMarketsForFeed(feed);
        uint256 len = markets.length;
        for (uint256 i; i < len; ++i) {
            _evaluateMarket(markets[i], p);
        }
    }

    // ─── Internal state machine ───────────────────────────────────────────────

    function _evaluateMarket(address market, uint256 price) internal {
        lastMarketPrice[market] = price;

        // Already resolved: clean up any stale state and skip
        if (IPredictionMarket(market).resolved()) {
            if (depegStates[market].active) delete depegStates[market];
            return;
        }

        // Deadline passed without a confirmed depeg → resolve NO (covered period expired)
        if (block.timestamp > IPredictionMarket(market).resolutionDeadline()) {
            _resolveNo(market);
            return;
        }

        // Recovery: price at or above $0.97 — clear active window
        if (price >= RECOVERY_THRESHOLD) {
            if (depegStates[market].active) {
                delete depegStates[market];
                emit DepegCleared(market, price);
            }
            return;
        }

        uint8 detected = _detectLevel(price);
        DepegState storage state = depegStates[market];

        if (!state.active) {
            // New depeg window
            state.active     = true;
            state.level      = detected;
            state.startBlock = uint64(block.number);
            emit DepegDetected(market, detected, price, block.number);
        } else if (detected > state.level) {
            // Escalation to a more severe level — reset block counter
            // Level never decreases: if detected <= state.level we keep the current level
            state.level      = detected;
            state.startBlock = uint64(block.number);
            emit DepegEscalated(market, detected, price, block.number);
        }

        // Resolve if the required blocks have elapsed since the current level was entered
        if (uint64(block.number) - state.startBlock >= levels[state.level].requiredBlocks) {
            _resolveYes(market);
        }
    }

    /// @dev Returns the most severe depeg level for a given price.
    ///      Only called when price < RECOVERY_THRESHOLD, so level 0 is always valid.
    function _detectLevel(uint256 price) internal view returns (uint8) {
        for (uint8 i = 3; i > 0; ) {
            if (price < levels[i].threshold) return i;
            unchecked { --i; }
        }
        return 0;
    }

    function _resolveYes(address market) internal {
        IPredictionMarket(market).resolve(true);
        delete depegStates[market];
        emit MarketResolved(market, true, block.number);
    }

    function _resolveNo(address market) internal {
        IPredictionMarket(market).resolve(false);
        delete depegStates[market];
        emit MarketResolved(market, false, block.number);
    }

    // ─── Admin: market creation ───────────────────────────────────────────────

    /// @notice Deploy a prediction market via the factory.
    ///         DepegResolver becomes the market owner so it can resolve it automatically.
    ///         Caller must approve this contract to spend `initialLiquidity` USDC first.
    ///         This contract must hold MARKET_CREATOR_ROLE on the factory.
    function createMarket(
        string calldata question,
        string calldata category,
        uint256 resolutionDeadline,
        uint256 initialLiquidity,
        address priceFeed
    ) external onlyOwner returns (address market) {
        usdc.transferFrom(msg.sender, address(this), initialLiquidity);
        usdc.approve(address(factory), initialLiquidity);
        market = factory.createMarket(question, category, resolutionDeadline, initialLiquidity, priceFeed);
    }

    // ─── Admin: liquidity withdrawal ─────────────────────────────────────────

    /// @notice Withdraw all LP shares this contract holds in a market and forward
    ///         the USDC to the owner. Used to reclaim initial liquidity after a
    ///         market resolves (or at any time).
    function claimLiquidity(address market) external onlyOwner {
        uint256 shares = IPredictionMarket(market).lpShares(address(this));
        if (shares == 0) revert NoLiquidityToWithdraw();
        IPredictionMarket(market).removeLiquidity(shares);
        uint256 balance = usdc.balanceOf(address(this));
        if (balance > 0) usdc.transfer(owner(), balance);
    }

    // ─── Admin: manual resolution ─────────────────────────────────────────────

    /// @notice Force-resolve a market to any outcome. For demos and emergencies.
    function forceResolve(address market, bool yesWins) external onlyOwner {
        IPredictionMarket(market).resolve(yesWins);
        delete depegStates[market];
        emit MarketResolved(market, yesWins, block.number);
    }

    // ─── Admin: configuration ─────────────────────────────────────────────────

    /// @notice Update a single level's price threshold and block requirement.
    function setLevelConfig(uint8 levelIdx, uint256 threshold, uint64 requiredBlocks) external onlyOwner {
        if (levelIdx >= 4) revert InvalidLevelIndex();
        levels[levelIdx] = LevelConfig({threshold: threshold, requiredBlocks: requiredBlocks});
        emit LevelConfigUpdated(levelIdx, threshold, requiredBlocks);
    }
}
