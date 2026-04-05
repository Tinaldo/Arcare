// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "./interfaces/IERC20.sol";

/// @title PredictionMarket
/// @notice Fixed Product Market Maker (FPMM) prediction market.
///         Collateral: Any IERC20 (USDC, EURC, …). Outcome tokens tracked
///         internally (no ERC20 per outcome).
///
///         Invariant: yesReserve * noReserve = k (constant across trades, grows with liquidity).
///
///         BUY formula (buying YES with c collateral):
///           tokensOut = (yesR + c) - k / (noR + c)
///           yesR_new  = k / (noR + c),  noR_new = noR + c
///
///         SELL formula (selling s YES for c collateral) — quadratic solve:
///           (yesR + s - c)(noR - c) = k
///           c² - (yesR + s + noR)c + noR * s = 0
///           c = [(yesR+s+noR) - sqrt((yesR+s+noR)² - 4*noR*s)] / 2
///
///         Resolution: owner-controlled. TODO: replace with Chainlink CRE resolver.
contract PredictionMarket {
    // ─── State ────────────────────────────────────────────────────────────────

    IERC20 public immutable collateral;
    address public immutable owner;
    address public immutable factory;

    string public question;
    string public category; // "DEPEG" | "HACK"
    uint256 public resolutionDeadline;

    // FPMM reserves — invariant: yesReserve * noReserve = k
    uint256 public yesReserve;
    uint256 public noReserve;

    // Internal outcome balances (no ERC20 token per outcome)
    mapping(address => uint256) public yesBalances;
    mapping(address => uint256) public noBalances;

    // LP tracking
    mapping(address => uint256) public lpShares;
    uint256 public totalLPShares;
    uint256 public totalCollateral;
    uint256 public yesOpenInterest;
    uint256 public noOpenInterest;

    // Resolution
    bool public resolved;
    bool public yesWins;

    // ─── Events ───────────────────────────────────────────────────────────────

    event LiquidityAdded(address indexed provider, uint256 collateralIn, uint256 sharesOut);
    event LiquidityRemoved(address indexed provider, uint256 sharesIn, uint256 collateralOut);
    event OutcomeBought(address indexed buyer, bool isYes, uint256 collateralIn, uint256 tokensOut);
    event OutcomeSold(address indexed seller, bool isYes, uint256 tokensIn, uint256 collateralOut);
    event MarketResolved(bool yesWins);
    event Redeemed(address indexed winner, uint256 tokensRedeemed, uint256 collateralOut);
    event MarketDeleted(address indexed owner, uint256 collateralRefunded);

    // ─── Errors ───────────────────────────────────────────────────────────────

    error NotOwner();
    error MarketNotResolved();
    error MarketAlreadyResolved();
    error SlippageExceeded();
    error ZeroAmount();
    error InsufficientBalance();
    error NothingToRedeem();
    error NotFactory();
    error OpenInterestExists();
    error ExternalLiquidityExists();
    error LiquidityLocked();

    // ─── Constructor ──────────────────────────────────────────────────────────

    /// @param _owner          Address that can resolve (receives initial LP shares)
    /// @param _collateral     ERC20 collateral token (USDC, EURC, …)
    /// @param _question       Human-readable prediction question
    /// @param _category       "DEPEG" or "HACK"
    /// @param _deadline       Unix timestamp; resolution expected by this date
    /// @param _initLiquidity  Initial collateral already transferred by factory
    constructor(
        address _owner,
        address _collateral,
        string memory _question,
        string memory _category,
        uint256 _deadline,
        uint256 _initLiquidity
    ) {
        require(_initLiquidity >= 2, "Min 2 collateral units");
        owner      = _owner;
        factory    = msg.sender;
        collateral = IERC20(_collateral);
        question   = _question;
        category   = _category;
        resolutionDeadline = _deadline;

        // 50/50 bootstrap → probability starts at 50%
        uint256 half    = _initLiquidity / 2;
        yesReserve      = half;
        noReserve       = _initLiquidity - half;
        totalCollateral = _initLiquidity;

        lpShares[_owner] = _initLiquidity;
        totalLPShares    = _initLiquidity;

        emit LiquidityAdded(_owner, _initLiquidity, _initLiquidity);
    }

    // ─── Backward-compat alias ────────────────────────────────────────────────

    /// @dev Returns the collateral token address.
    ///      Kept so existing USDC deployments (which expose a `usdc()` getter
    ///      from the old immutable name) and `markets.ts` `functionName:"usdc"`
    ///      calls remain compatible without an ABI change.
    function usdc() external view returns (address) {
        return address(collateral);
    }

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier notResolved() {
        if (resolved) revert MarketAlreadyResolved();
        _;
    }

    modifier onlyFactory() {
        if (msg.sender != factory) revert NotFactory();
        _;
    }

    // ─── Liquidity ────────────────────────────────────────────────────────────

    /// @notice Add collateral liquidity, preserving the current YES/NO price ratio.
    function addLiquidity(uint256 collateralIn) external notResolved {
        if (collateralIn == 0) revert ZeroAmount();
        collateral.transferFrom(msg.sender, address(this), collateralIn);

        uint256 total  = yesReserve + noReserve;
        uint256 yesAdd = (collateralIn * yesReserve) / total;
        uint256 noAdd  = collateralIn - yesAdd;

        yesReserve += yesAdd;
        noReserve  += noAdd;

        uint256 sharesOut = totalLPShares == 0
            ? collateralIn
            : (collateralIn * totalLPShares) / totalCollateral;

        lpShares[msg.sender] += sharesOut;
        totalLPShares        += sharesOut;
        totalCollateral      += collateralIn;

        emit LiquidityAdded(msg.sender, collateralIn, sharesOut);
    }

    /// @notice Remove liquidity proportional to LP share ownership.
    ///         Only callable after resolution — LP capital is locked until the market settles.
    function removeLiquidity(uint256 shares) external {
        if (!resolved) revert LiquidityLocked();
        if (shares == 0) revert ZeroAmount();
        if (lpShares[msg.sender] < shares) revert InsufficientBalance();

        uint256 collateralOut = (shares * totalCollateral) / totalLPShares;

        lpShares[msg.sender] -= shares;
        totalLPShares        -= shares;
        totalCollateral      -= collateralOut;

        collateral.transfer(msg.sender, collateralOut);

        emit LiquidityRemoved(msg.sender, shares, collateralOut);
    }

    // ─── Trading ──────────────────────────────────────────────────────────────

    /// @notice Buy YES or NO outcome tokens with collateral.
    ///
    ///   Buying YES with c collateral:
    ///     k = yesR * noR
    ///     tokensOut = (yesR + c) - k / (noR + c)
    ///     yesR_new  = k / (noR + c),  noR_new = noR + c
    ///
    /// @param isYes           true = buy YES, false = buy NO
    /// @param collateralIn    Collateral to spend (6 decimals)
    /// @param minTokensOut    Slippage protection
    function buyOutcome(bool isYes, uint256 collateralIn, uint256 minTokensOut) external notResolved {
        if (collateralIn == 0) revert ZeroAmount();
        collateral.transferFrom(msg.sender, address(this), collateralIn);

        uint256 tokensOut = _calcBuy(isYes, collateralIn);
        if (tokensOut < minTokensOut) revert SlippageExceeded();

        uint256 k = yesReserve * noReserve;

        if (isYes) {
            uint256 newNo = noReserve + collateralIn;
            yesReserve = k / newNo;
            noReserve  = newNo;
            yesBalances[msg.sender] += tokensOut;
            yesOpenInterest         += tokensOut;
        } else {
            uint256 newYes = yesReserve + collateralIn;
            noReserve  = k / newYes;
            yesReserve = newYes;
            noBalances[msg.sender] += tokensOut;
            noOpenInterest         += tokensOut;
        }

        totalCollateral += collateralIn;

        emit OutcomeBought(msg.sender, isYes, collateralIn, tokensOut);
    }

    /// @notice Sell YES or NO outcome tokens back for collateral.
    ///
    ///   Selling s YES: (yesR + s - c)(noR - c) = k
    ///   c² - (yesR + s + noR)c + noR*s = 0
    ///
    /// @param isYes            true = sell YES, false = sell NO
    /// @param tokensIn         Outcome tokens to sell
    /// @param minCollateralOut Slippage protection
    function sellOutcome(bool isYes, uint256 tokensIn, uint256 minCollateralOut) external notResolved {
        if (tokensIn == 0) revert ZeroAmount();

        if (isYes) {
            if (yesBalances[msg.sender] < tokensIn) revert InsufficientBalance();
        } else {
            if (noBalances[msg.sender] < tokensIn) revert InsufficientBalance();
        }

        uint256 collateralOut = _calcSell(isYes, tokensIn);
        if (collateralOut < minCollateralOut) revert SlippageExceeded();

        if (isYes) {
            yesReserve = yesReserve + tokensIn - collateralOut;
            noReserve  = noReserve  - collateralOut;
            yesBalances[msg.sender] -= tokensIn;
            yesOpenInterest         -= tokensIn;
        } else {
            yesReserve = yesReserve - collateralOut;
            noReserve  = noReserve  + tokensIn - collateralOut;
            noBalances[msg.sender] -= tokensIn;
            noOpenInterest         -= tokensIn;
        }

        totalCollateral -= collateralOut;
        collateral.transfer(msg.sender, collateralOut);

        emit OutcomeSold(msg.sender, isYes, tokensIn, collateralOut);
    }

    // ─── Resolution ───────────────────────────────────────────────────────────

    /// @notice Resolve the market. onlyOwner.
    ///         TODO: integrate Chainlink CRE automation trigger here.
    function resolve(bool _yesWins) external onlyOwner notResolved {
        resolved = true;
        yesWins  = _yesWins;
        emit MarketResolved(_yesWins);
    }

    /// @notice Redeem winning tokens 1:1 for collateral after resolution.
    function redeem() external {
        if (!resolved) revert MarketNotResolved();

        uint256 tokens;
        if (yesWins) {
            tokens = yesBalances[msg.sender];
            if (tokens == 0) revert NothingToRedeem();
            yesBalances[msg.sender] = 0;
            yesOpenInterest -= tokens;
        } else {
            tokens = noBalances[msg.sender];
            if (tokens == 0) revert NothingToRedeem();
            noBalances[msg.sender] = 0;
            noOpenInterest -= tokens;
        }

        totalCollateral -= tokens;
        collateral.transfer(msg.sender, tokens);
        emit Redeemed(msg.sender, tokens, tokens);
    }

    /// @notice Permanently freeze the market and refund all collateral to the owner.
    ///         Only the factory can call this, and only when no trader positions
    ///         or external LPs exist.
    function deleteAndRefundOwner() external onlyFactory notResolved returns (uint256 collateralOut) {
        if (yesOpenInterest != 0 || noOpenInterest != 0) revert OpenInterestExists();

        uint256 ownerShares = lpShares[owner];
        if (ownerShares != totalLPShares) revert ExternalLiquidityExists();

        collateralOut = totalCollateral;

        resolved        = true;
        yesWins         = false;
        yesReserve      = 0;
        noReserve       = 0;
        totalCollateral = 0;
        totalLPShares   = 0;
        lpShares[owner] = 0;

        if (collateralOut > 0) {
            collateral.transfer(owner, collateralOut);
            emit LiquidityRemoved(owner, ownerShares, collateralOut);
        }

        emit MarketDeleted(owner, collateralOut);
    }

    // ─── View functions ───────────────────────────────────────────────────────

    function calcBuy(bool isYes, uint256 collateralIn) external view returns (uint256) {
        return _calcBuy(isYes, collateralIn);
    }

    function calcSell(bool isYes, uint256 tokensIn) external view returns (uint256) {
        return _calcSell(isYes, tokensIn);
    }

    /// @notice Returns implied probability as 1e18-scaled fixed point.
    ///         After resolution: winning side = 1e18, losing side = 0.
    ///         Before resolution: price(YES) = noReserve / (yesReserve + noReserve)
    function getPrice(bool isYes) external view returns (uint256) {
        if (resolved) return (yesWins == isYes) ? 1e18 : 0;
        uint256 total = yesReserve + noReserve;
        if (total == 0) return 0.5e18;
        return isYes ? (noReserve * 1e18) / total : (yesReserve * 1e18) / total;
    }

    /// @notice Returns all market state needed by the frontend in one call.
    function getMarketInfo()
        external
        view
        returns (
            string memory _question,
            string memory _category,
            uint256 _deadline,
            bool _resolved,
            bool _yesWins,
            uint256 _yesReserve,
            uint256 _noReserve,
            uint256 _totalCollateral,
            uint256 _yesPrice,
            uint256 _noPrice
        )
    {
        if (resolved) {
            _yesPrice = yesWins ? 1e18 : 0;
            _noPrice  = yesWins ? 0    : 1e18;
        } else {
            uint256 total = yesReserve + noReserve;
            _yesPrice = total == 0 ? 0.5e18 : (noReserve  * 1e18) / total;
            _noPrice  = total == 0 ? 0.5e18 : (yesReserve * 1e18) / total;
        }
        return (
            question,
            category,
            resolutionDeadline,
            resolved,
            yesWins,
            yesReserve,
            noReserve,
            totalCollateral,
            _yesPrice,
            _noPrice
        );
    }

    function getReserves() external view returns (uint256, uint256) {
        return (yesReserve, noReserve);
    }

    // ─── Internal math ────────────────────────────────────────────────────────

    function _calcBuy(bool isYes, uint256 collateralIn) internal view returns (uint256) {
        uint256 k = yesReserve * noReserve;
        if (isYes) {
            return (yesReserve + collateralIn) - k / (noReserve + collateralIn);
        } else {
            return (noReserve + collateralIn) - k / (yesReserve + collateralIn);
        }
    }

    function _calcSell(bool isYes, uint256 tokensIn) internal view returns (uint256) {
        uint256 sameR  = isYes ? yesReserve : noReserve;
        uint256 otherR = isYes ? noReserve  : yesReserve;

        uint256 b      = sameR + tokensIn + otherR;
        uint256 fourAC = 4 * otherR * tokensIn;
        uint256 sqrtD  = _sqrt(b * b - fourAC);
        return (b - sqrtD) / 2;
    }

    /// @dev Integer square root (Babylonian method). Returns floor(sqrt(x)).
    function _sqrt(uint256 x) internal pure returns (uint256 y) {
        if (x == 0) return 0;
        y = x;
        uint256 z = (x + 1) / 2;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
    }
}
