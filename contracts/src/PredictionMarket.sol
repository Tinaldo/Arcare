// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "./interfaces/IERC20.sol";

/// @title PredictionMarket
/// @notice Fixed Product Market Maker (FPMM) prediction market.
///         Collateral: USDC. Outcome tokens tracked internally (no ERC20 per outcome).
///
///         Invariant: yesReserve * noReserve = k (constant across trades, grows with liquidity).
///
///         BUY formula (buying YES with c USDC):
///           tokensOut = (yesR + c) - k / (noR + c)
///           yesR_new = k / (noR + c),  noR_new = noR + c
///
///         SELL formula (selling s YES for c USDC) — requires quadratic solve:
///           (yesR + s - c)(noR - c) = k
///           c² - (yesR + s + noR)c + noR * s = 0
///           c = [(yesR+s+noR) - sqrt((yesR+s+noR)² - 4*noR*s)] / 2
///
///         Resolution: owner-controlled. TODO: replace with Chainlink CRE resolver.
contract PredictionMarket {
    // ─── State ────────────────────────────────────────────────────────────────

    IERC20 public immutable usdc;
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

    event LiquidityAdded(address indexed provider, uint256 usdcIn, uint256 sharesOut);
    event LiquidityRemoved(address indexed provider, uint256 sharesIn, uint256 usdcOut);
    event OutcomeBought(address indexed buyer, bool isYes, uint256 usdcIn, uint256 tokensOut);
    event OutcomeSold(address indexed seller, bool isYes, uint256 tokensIn, uint256 usdcOut);
    event MarketResolved(bool yesWins);
    event Redeemed(address indexed winner, uint256 tokensRedeemed, uint256 usdcOut);
    event MarketDeleted(address indexed owner, uint256 usdcRefunded);

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

    // ─── Constructor ──────────────────────────────────────────────────────────

    /// @param _owner         Address that can resolve (receives initial LP shares)
    /// @param _usdc          USDC token address on Arc Testnet
    /// @param _question      Human-readable prediction question
    /// @param _category      "DEPEG" or "HACK"
    /// @param _deadline      Unix timestamp; resolution expected by this date
    /// @param _initLiquidity Initial USDC already transferred by factory
    constructor(
        address _owner,
        address _usdc,
        string memory _question,
        string memory _category,
        uint256 _deadline,
        uint256 _initLiquidity
    ) {
        require(_initLiquidity >= 2, "Min 2 USDC units");
        owner = _owner;
        factory = msg.sender;
        usdc = IERC20(_usdc);
        question = _question;
        category = _category;
        resolutionDeadline = _deadline;

        // 50/50 bootstrap → probability starts at 50%
        uint256 half = _initLiquidity / 2;
        yesReserve = half;
        noReserve = _initLiquidity - half;
        totalCollateral = _initLiquidity;

        lpShares[_owner] = _initLiquidity;
        totalLPShares = _initLiquidity;

        emit LiquidityAdded(_owner, _initLiquidity, _initLiquidity);
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

    /// @notice Add USDC liquidity, preserving the current YES/NO price ratio.
    function addLiquidity(uint256 usdcIn) external notResolved {
        if (usdcIn == 0) revert ZeroAmount();
        usdc.transferFrom(msg.sender, address(this), usdcIn);

        uint256 total = yesReserve + noReserve;
        uint256 yesAdd = (usdcIn * yesReserve) / total;
        uint256 noAdd = usdcIn - yesAdd;

        yesReserve += yesAdd;
        noReserve += noAdd;

        uint256 sharesOut = totalLPShares == 0
            ? usdcIn
            : (usdcIn * totalLPShares) / totalCollateral;

        lpShares[msg.sender] += sharesOut;
        totalLPShares += sharesOut;
        totalCollateral += usdcIn;

        emit LiquidityAdded(msg.sender, usdcIn, sharesOut);
    }

    /// @notice Remove liquidity proportional to LP share ownership.
    ///         Callable before and after resolution. After resolution, LPs receive
    ///         their share of the remaining collateral (losing-side tokens + any
    ///         unclaimed winning tokens). Reserve updates are skipped post-resolution
    ///         since the AMM is no longer active.
    function removeLiquidity(uint256 shares) external {
        if (shares == 0) revert ZeroAmount();
        if (lpShares[msg.sender] < shares) revert InsufficientBalance();

        uint256 usdcOut = (shares * totalCollateral) / totalLPShares;

        if (!resolved) {
            yesReserve -= (shares * yesReserve) / totalLPShares;
            noReserve -= (shares * noReserve) / totalLPShares;
        }

        lpShares[msg.sender] -= shares;
        totalLPShares -= shares;
        totalCollateral -= usdcOut;

        usdc.transfer(msg.sender, usdcOut);

        emit LiquidityRemoved(msg.sender, shares, usdcOut);
    }

    // ─── Trading ──────────────────────────────────────────────────────────────

    /// @notice Buy YES or NO outcome tokens with USDC.
    ///
    ///   Buying YES with c USDC:
    ///     k = yesR * noR
    ///     tokensOut = (yesR + c) - k / (noR + c)
    ///     yesR_new  = k / (noR + c)
    ///     noR_new   = noR + c
    ///
    /// @param isYes        true = buy YES, false = buy NO
    /// @param usdcIn       USDC to spend (6 decimals)
    /// @param minTokensOut Slippage protection
    function buyOutcome(bool isYes, uint256 usdcIn, uint256 minTokensOut) external notResolved {
        if (usdcIn == 0) revert ZeroAmount();
        usdc.transferFrom(msg.sender, address(this), usdcIn);

        uint256 tokensOut = _calcBuy(isYes, usdcIn);
        if (tokensOut < minTokensOut) revert SlippageExceeded();

        uint256 k = yesReserve * noReserve;

        if (isYes) {
            uint256 newNo = noReserve + usdcIn;
            yesReserve = k / newNo;
            noReserve = newNo;
            yesBalances[msg.sender] += tokensOut;
            yesOpenInterest += tokensOut;
        } else {
            uint256 newYes = yesReserve + usdcIn;
            noReserve = k / newYes;
            yesReserve = newYes;
            noBalances[msg.sender] += tokensOut;
            noOpenInterest += tokensOut;
        }

        totalCollateral += usdcIn;

        emit OutcomeBought(msg.sender, isYes, usdcIn, tokensOut);
    }

    /// @notice Sell YES or NO outcome tokens back for USDC.
    ///
    ///   Selling s YES tokens for c USDC solves:
    ///     (yesR + s - c)(noR - c) = k
    ///     c² - (yesR + s + noR)c + noR*s = 0
    ///     c = [(yesR+s+noR) - sqrt((yesR+s+noR)² - 4*noR*s)] / 2
    ///
    /// @param isYes      true = sell YES, false = sell NO
    /// @param tokensIn   Outcome tokens to sell
    /// @param minUsdcOut Slippage protection
    function sellOutcome(bool isYes, uint256 tokensIn, uint256 minUsdcOut) external notResolved {
        if (tokensIn == 0) revert ZeroAmount();

        if (isYes) {
            if (yesBalances[msg.sender] < tokensIn) revert InsufficientBalance();
        } else {
            if (noBalances[msg.sender] < tokensIn) revert InsufficientBalance();
        }

        uint256 usdcOut = _calcSell(isYes, tokensIn);
        if (usdcOut < minUsdcOut) revert SlippageExceeded();

        // Update reserves: undo the mint, burn the pair
        if (isYes) {
            // yesR_new = yesR + tokensIn - usdcOut
            // noR_new  = noR - usdcOut
            yesReserve = yesReserve + tokensIn - usdcOut;
            noReserve = noReserve - usdcOut;
            yesBalances[msg.sender] -= tokensIn;
            yesOpenInterest -= tokensIn;
        } else {
            yesReserve = yesReserve - usdcOut;
            noReserve = noReserve + tokensIn - usdcOut;
            noBalances[msg.sender] -= tokensIn;
            noOpenInterest -= tokensIn;
        }

        totalCollateral -= usdcOut;
        usdc.transfer(msg.sender, usdcOut);

        emit OutcomeSold(msg.sender, isYes, tokensIn, usdcOut);
    }

    // ─── Resolution ───────────────────────────────────────────────────────────

    /// @notice Resolve the market. onlyOwner.
    ///         TODO: integrate Chainlink CRE automation trigger here.
    function resolve(bool _yesWins) external onlyOwner notResolved {
        resolved = true;
        yesWins = _yesWins;
        emit MarketResolved(_yesWins);
    }

    /// @notice Redeem winning tokens 1:1 for USDC after resolution.
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
        usdc.transfer(msg.sender, tokens);
        emit Redeemed(msg.sender, tokens, tokens);
    }

    /// @notice Permanently freeze the market and refund all collateral to the owner.
    ///         Only the factory can call this, and only when no trader positions or external LPs exist.
    function deleteAndRefundOwner() external onlyFactory notResolved returns (uint256 usdcOut) {
        if (yesOpenInterest != 0 || noOpenInterest != 0) revert OpenInterestExists();

        uint256 ownerShares = lpShares[owner];
        if (ownerShares != totalLPShares) revert ExternalLiquidityExists();

        usdcOut = totalCollateral;

        resolved = true;
        yesWins = false;
        yesReserve = 0;
        noReserve = 0;
        totalCollateral = 0;
        totalLPShares = 0;
        lpShares[owner] = 0;

        if (usdcOut > 0) {
            usdc.transfer(owner, usdcOut);
            emit LiquidityRemoved(owner, ownerShares, usdcOut);
        }

        emit MarketDeleted(owner, usdcOut);
    }

    // ─── View functions ───────────────────────────────────────────────────────

    function calcBuy(bool isYes, uint256 usdcIn) external view returns (uint256) {
        return _calcBuy(isYes, usdcIn);
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
            _noPrice  = yesWins ? 0 : 1e18;
        } else {
            uint256 total = yesReserve + noReserve;
            _yesPrice = total == 0 ? 0.5e18 : (noReserve * 1e18) / total;
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

    /// Buy formula (same for both outcomes, just swap which reserve is "same" vs "other"):
    ///   buyYES: sameR=yesR, otherR=noR  → tokensOut = (yesR+c) - k/(noR+c)
    ///   buyNO:  sameR=noR,  otherR=yesR → tokensOut = (noR+c)  - k/(yesR+c)
    function _calcBuy(bool isYes, uint256 usdcIn) internal view returns (uint256) {
        uint256 k = yesReserve * noReserve;
        if (isYes) {
            return (yesReserve + usdcIn) - k / (noReserve + usdcIn);
        } else {
            return (noReserve + usdcIn) - k / (yesReserve + usdcIn);
        }
    }

    /// Sell formula — quadratic solve:
    ///   Selling s YES: (yesR + s - c)(noR - c) = k
    ///   c² - (yesR + s + noR)c + noR*s = 0
    ///   c = [(yesR+s+noR) - sqrt((yesR+s+noR)² - 4*noR*s)] / 2
    ///
    ///   Selling s NO:  (yesR - c)(noR + s - c) = k
    ///   Same form with yes/no swapped.
    function _calcSell(bool isYes, uint256 tokensIn) internal view returns (uint256) {
        uint256 sameR  = isYes ? yesReserve : noReserve;
        uint256 otherR = isYes ? noReserve  : yesReserve;

        // Quadratic: c² - (sameR + tokensIn + otherR)c + otherR * tokensIn = 0
        uint256 b = sameR + tokensIn + otherR;
        uint256 fourAC = 4 * otherR * tokensIn;

        uint256 discriminant = b * b - fourAC;
        uint256 sqrtD = _sqrt(discriminant);

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
