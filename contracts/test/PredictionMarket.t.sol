// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console2} from "forge-std/Test.sol";
import {PredictionMarket} from "../src/PredictionMarket.sol";
import {MarketFactory} from "../src/MarketFactory.sol";
import {PriceRouter} from "../src/PriceRouter.sol";

/// @dev Minimal ERC20 mock for USDC in tests
contract MockUSDC {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "insufficient");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "insufficient");
        require(allowance[from][msg.sender] >= amount, "allowance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function decimals() external pure returns (uint8) { return 6; }
}

contract PredictionMarketTest is Test {
    MockUSDC usdc;
    MarketFactory factory;
    PredictionMarket market;
    PriceRouter router;

    address alice = address(0xA11CE);
    address bob   = address(0xB0B);
    address owner = address(this);

    uint256 constant INIT_LIQ  = 1000e6; // 1000 USDC
    uint256 constant DEADLINE  = 2_000_000_000; // far future

    function setUp() public {
        usdc = new MockUSDC();
        router = new PriceRouter(owner);
        factory = new MarketFactory(address(usdc), address(router));
        router.grantMarketRegistrar(address(factory));

        // Fund owner and create market
        usdc.mint(owner, 10_000e6);
        usdc.approve(address(factory), type(uint256).max);

        address mAddr = factory.createMarket(
            "Will USDC depeg below $0.99 before end of 2025?",
            "DEPEG",
            DEADLINE,
            INIT_LIQ,
            address(0)
        );
        market = PredictionMarket(mAddr);

        // Fund traders
        usdc.mint(alice, 1_000e6);
        usdc.mint(bob, 1_000e6);
        vm.prank(alice); usdc.approve(address(market), type(uint256).max);
        vm.prank(bob);   usdc.approve(address(market), type(uint256).max);
    }

    // ─── Initial state ────────────────────────────────────────────────────────

    function test_InitialReserves() public view {
        (uint256 yes, uint256 no) = market.getReserves();
        assertEq(yes + no, INIT_LIQ, "reserves sum to init liquidity");
        assertApproxEqRel(yes, no, 0.001e18, "50/50 init");
    }

    function test_InitialPrice_50pct() public view {
        uint256 yesPrice = market.getPrice(true);
        uint256 noPrice  = market.getPrice(false);
        assertApproxEqRel(yesPrice, 0.5e18, 0.001e18, "YES ~50%");
        assertApproxEqRel(noPrice,  0.5e18, 0.001e18, "NO ~50%");
        assertApproxEqRel(yesPrice + noPrice, 1e18, 0.001e18, "prices sum to 1");
    }

    function test_InitialLPShares() public view {
        assertEq(market.lpShares(owner), INIT_LIQ);
        assertEq(market.totalLPShares(), INIT_LIQ);
    }

    // ─── FPMM invariant ───────────────────────────────────────────────────────

    function test_InvariantAfterBuyYes() public {
        (uint256 yesBefore, uint256 noBefore) = market.getReserves();
        uint256 kBefore = yesBefore * noBefore;

        vm.prank(alice);
        market.buyOutcome(true, 100e6, 0);

        (uint256 yesAfter, uint256 noAfter) = market.getReserves();
        uint256 kAfter = yesAfter * noAfter;

        // k should be equal (within integer rounding)
        assertApproxEqAbs(kAfter, kBefore, kBefore / 1e6, "k invariant holds");
    }

    function test_InvariantAfterBuyNo() public {
        (uint256 yesBefore, uint256 noBefore) = market.getReserves();
        uint256 kBefore = yesBefore * noBefore;

        vm.prank(alice);
        market.buyOutcome(false, 100e6, 0);

        (uint256 yesAfter, uint256 noAfter) = market.getReserves();
        uint256 kAfter = yesAfter * noAfter;

        assertApproxEqAbs(kAfter, kBefore, kBefore / 1e6, "k invariant holds after buy NO");
    }

    // ─── Buying YES ───────────────────────────────────────────────────────────

    function test_BuyYes_ReceivesTokens() public {
        uint256 usdcIn = 100e6;
        uint256 expected = market.calcBuy(true, usdcIn);

        vm.prank(alice);
        market.buyOutcome(true, usdcIn, 0);

        assertEq(market.yesBalances(alice), expected, "YES balance matches calcBuy");
    }

    function test_BuyYes_RaisesYesPrice() public {
        uint256 priceBefore = market.getPrice(true);

        vm.prank(alice);
        market.buyOutcome(true, 100e6, 0);

        uint256 priceAfter = market.getPrice(true);
        assertTrue(priceAfter > priceBefore, "YES price rises after buying YES");
    }

    function test_BuyNo_RaisesNoPrice() public {
        uint256 priceBefore = market.getPrice(false);

        vm.prank(alice);
        market.buyOutcome(false, 100e6, 0);

        uint256 priceAfter = market.getPrice(false);
        assertTrue(priceAfter > priceBefore, "NO price rises after buying NO");
    }

    function test_BuyYes_SlippageProtection() public {
        uint256 minOut = type(uint256).max;
        vm.prank(alice);
        vm.expectRevert(PredictionMarket.SlippageExceeded.selector);
        market.buyOutcome(true, 100e6, minOut);
    }

    // ─── Selling ──────────────────────────────────────────────────────────────

    function test_SellYes_ReceivesUsdc() public {
        // Buy first
        vm.prank(alice);
        market.buyOutcome(true, 100e6, 0);
        uint256 yesTokens = market.yesBalances(alice);

        uint256 usdcBefore = usdc.balanceOf(alice);
        uint256 expectedUsdc = market.calcSell(true, yesTokens);

        vm.prank(alice);
        market.sellOutcome(true, yesTokens, 0);

        uint256 usdcAfter = usdc.balanceOf(alice);
        assertApproxEqAbs(usdcAfter - usdcBefore, expectedUsdc, 1, "USDC received matches calcSell");
    }

    function test_SellYes_SlippageProtection() public {
        vm.prank(alice);
        market.buyOutcome(true, 100e6, 0);
        uint256 yesTokens = market.yesBalances(alice);

        vm.prank(alice);
        vm.expectRevert(PredictionMarket.SlippageExceeded.selector);
        market.sellOutcome(true, yesTokens, type(uint256).max);
    }

    function test_SellYes_InsufficientBalance() public {
        vm.prank(alice);
        vm.expectRevert(PredictionMarket.InsufficientBalance.selector);
        market.sellOutcome(true, 1, 0);
    }

    // ─── Round-trip ───────────────────────────────────────────────────────────

    function test_BuySellRoundTrip_LessThanInput() public {
        uint256 usdcIn = 100e6;
        uint256 aliceBefore = usdc.balanceOf(alice);

        vm.prank(alice);
        market.buyOutcome(true, usdcIn, 0);
        uint256 yesTokens = market.yesBalances(alice);

        vm.prank(alice);
        market.sellOutcome(true, yesTokens, 0);

        uint256 aliceAfter = usdc.balanceOf(alice);
        // After buy + sell, USDC should be <= original (AMM spread)
        assertLe(aliceAfter, aliceBefore, "no free money from round-trip");
        // But should be close (within 5%)
        assertGe(aliceAfter, (aliceBefore * 95) / 100, "round-trip loss < 5%");
    }

    // ─── Liquidity ────────────────────────────────────────────────────────────

    function test_AddLiquidity() public {
        uint256 addAmount = 500e6;
        usdc.mint(alice, addAmount);
        vm.prank(alice);
        usdc.approve(address(market), addAmount);

        uint256 sharesBefore = market.totalLPShares();
        vm.prank(alice);
        market.addLiquidity(addAmount);

        assertGt(market.lpShares(alice), 0, "alice got LP shares");
        assertGt(market.totalLPShares(), sharesBefore, "total LP shares increased");
    }

    function test_RemoveLiquidity() public {
        uint256 shares = market.lpShares(owner);
        uint256 usdcBefore = usdc.balanceOf(owner);

        market.removeLiquidity(shares);

        assertEq(market.lpShares(owner), 0, "LP shares burned");
        assertGt(usdc.balanceOf(owner), usdcBefore, "USDC returned");
    }

    // ─── Resolution & Redemption ──────────────────────────────────────────────

    function test_ResolveYes_OnlyOwner() public {
        vm.prank(alice);
        vm.expectRevert(PredictionMarket.NotOwner.selector);
        market.resolve(true);
    }

    function test_ResolveYes_CannotResolveAgain() public {
        market.resolve(true);
        vm.expectRevert(PredictionMarket.MarketAlreadyResolved.selector);
        market.resolve(false);
    }

    function test_Redeem_YesWins() public {
        // Alice buys YES
        uint256 usdcIn = 100e6;
        vm.prank(alice);
        market.buyOutcome(true, usdcIn, 0);
        uint256 yesTokens = market.yesBalances(alice);

        // Resolve YES
        market.resolve(true);

        // Alice redeems
        uint256 usdcBefore = usdc.balanceOf(alice);
        vm.prank(alice);
        market.redeem();

        assertEq(usdc.balanceOf(alice) - usdcBefore, yesTokens, "redeems 1 USDC per token");
        assertEq(market.yesBalances(alice), 0, "YES balance cleared");
    }

    function test_Redeem_NoWins_YesHolderGetsNothing() public {
        vm.prank(alice);
        market.buyOutcome(true, 100e6, 0); // alice holds YES

        market.resolve(false); // NO wins

        vm.prank(alice);
        vm.expectRevert(PredictionMarket.NothingToRedeem.selector);
        market.redeem();
    }

    function test_Redeem_NoWins_NoHolder() public {
        vm.prank(bob);
        market.buyOutcome(false, 100e6, 0);
        uint256 noTokens = market.noBalances(bob);

        market.resolve(false);

        uint256 usdcBefore = usdc.balanceOf(bob);
        vm.prank(bob);
        market.redeem();
        assertEq(usdc.balanceOf(bob) - usdcBefore, noTokens, "NO holder redeems correctly");
    }

    function test_Redeem_BeforeResolution_Reverts() public {
        vm.prank(alice);
        market.buyOutcome(true, 100e6, 0);

        vm.prank(alice);
        vm.expectRevert(PredictionMarket.MarketNotResolved.selector);
        market.redeem();
    }

    function test_NoTradingAfterResolution() public {
        market.resolve(true);

        vm.prank(alice);
        vm.expectRevert(PredictionMarket.MarketAlreadyResolved.selector);
        market.buyOutcome(true, 100e6, 0);
    }

    // ─── Factory ──────────────────────────────────────────────────────────────

    function test_Factory_RegistersMarket() public view {
        assertEq(factory.getMarketCount(), 1);
        address[] memory markets = factory.getMarkets(0, 10);
        assertEq(markets.length, 1);
        assertEq(markets[0], address(market));
    }

    function test_Factory_MarketInfo() public view {
        MarketFactory.MarketInfo memory info = factory.getMarketInfo(address(market));
        assertEq(info.category, "DEPEG");
        assertEq(info.priceFeed, address(0));
    }

    function test_Factory_RegistersPriceFeedRoute() public {
        address priceFeed = address(0xfeed);

        address routedMarket = factory.createMarket(
            "Will ETH break $10k?",
            "HACK",
            DEADLINE + 1,
            100e6,
            priceFeed
        );

        assertEq(router.feedByMarket(routedMarket), priceFeed);
        assertEq(router.getMarketCountForFeed(priceFeed), 1);
    }

    function test_Factory_RemoveMarket_UnregistersPriceFeedRoute() public {
        address priceFeed = address(0xfeed);
        address routedMarket = factory.createMarket(
            "Will BTC break $200k?",
            "HACK",
            DEADLINE + 2,
            100e6,
            priceFeed
        );

        factory.removeMarket(routedMarket);

        assertEq(router.feedByMarket(routedMarket), address(0));
        assertEq(router.getMarketCountForFeed(priceFeed), 0);
    }

    function test_Factory_RemoveMarket() public {
        factory.removeMarket(address(market));

        assertEq(factory.getMarketCount(), 0);
        address[] memory markets = factory.getMarkets(0, 10);
        assertEq(markets.length, 0);
        assertFalse(factory.isMarket(address(market)));
    }

    function test_Factory_RemoveMarket_OnlyAdmin() public {
        vm.prank(alice);
        vm.expectRevert();
        factory.removeMarket(address(market));
    }

    function test_Factory_RemoveMarket_UnknownMarket() public {
        vm.expectRevert(MarketFactory.UnknownMarket.selector);
        factory.removeMarket(address(0xdead));
    }

    function test_Factory_DeleteMarket_RefundsOwner() public {
        uint256 ownerUsdcBefore = usdc.balanceOf(owner);

        factory.deleteMarket(address(market));

        assertEq(factory.getMarketCount(), 0);
        assertEq(usdc.balanceOf(owner), ownerUsdcBefore + INIT_LIQ);
        assertEq(market.totalCollateral(), 0);
        assertEq(market.totalLPShares(), 0);
        assertTrue(market.resolved());
        assertEq(router.feedByMarket(address(market)), address(0));
    }

    function test_Factory_DeleteMarket_UnregistersPriceFeedRoute() public {
        address priceFeed = address(0xfeed);
        address routedMarket = factory.createMarket(
            "Will SOL break $1,000?",
            "HACK",
            DEADLINE + 3,
            100e6,
            priceFeed
        );

        factory.deleteMarket(routedMarket);

        assertEq(router.feedByMarket(routedMarket), address(0));
        assertEq(router.getMarketCountForFeed(priceFeed), 0);
    }

    function test_Factory_DeleteMarket_RevertsWithOpenInterest() public {
        vm.prank(alice);
        market.buyOutcome(true, 100e6, 0);

        vm.expectRevert(PredictionMarket.OpenInterestExists.selector);
        factory.deleteMarket(address(market));
    }

    function test_Factory_DeleteMarket_RevertsWithExternalLiquidity() public {
        uint256 addAmount = 500e6;
        usdc.mint(alice, addAmount);
        vm.prank(alice);
        usdc.approve(address(market), addAmount);
        vm.prank(alice);
        market.addLiquidity(addAmount);

        vm.expectRevert(PredictionMarket.ExternalLiquidityExists.selector);
        factory.deleteMarket(address(market));
    }

    function test_Factory_DeleteMarket_UnknownMarket() public {
        vm.expectRevert(MarketFactory.UnknownMarket.selector);
        factory.deleteMarket(address(0xdead));
    }

    function test_Factory_InvalidDeadline() public {
        vm.expectRevert(MarketFactory.InvalidDeadline.selector);
        factory.createMarket("Q?", "HACK", block.timestamp, 100e6, address(0));
    }

    function test_Factory_ZeroLiquidity() public {
        vm.expectRevert(MarketFactory.ZeroLiquidity.selector);
        factory.createMarket("Q?", "HACK", DEADLINE, 0, address(0));
    }

    // ─── Fuzz ─────────────────────────────────────────────────────────────────

    function testFuzz_BuyYes_AlwaysPositiveTokens(uint256 usdcIn) public {
        usdcIn = bound(usdcIn, 1e3, 100e6); // 0.001 to 100 USDC
        usdc.mint(alice, usdcIn);
        vm.prank(alice);
        usdc.approve(address(market), usdcIn);

        uint256 tokensOut = market.calcBuy(true, usdcIn);
        assertTrue(tokensOut > 0, "always get positive tokens");
    }

    function testFuzz_InvariantHolds_AfterBuy(uint256 usdcIn) public {
        usdcIn = bound(usdcIn, 1e3, 100e6);
        usdc.mint(alice, usdcIn);
        vm.prank(alice);
        usdc.approve(address(market), usdcIn);

        (uint256 y0, uint256 n0) = market.getReserves();
        uint256 k0 = y0 * n0;

        vm.prank(alice);
        market.buyOutcome(true, usdcIn, 0);

        (uint256 y1, uint256 n1) = market.getReserves();
        uint256 k1 = y1 * n1;

        assertApproxEqRel(k1, k0, 1e12, "k invariant holds under fuzz");
    }
}
