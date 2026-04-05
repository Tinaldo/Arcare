// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console2} from "forge-std/Test.sol";
import {DepegResolver} from "../src/DepegResolver.sol";
import {PredictionMarket} from "../src/PredictionMarket.sol";
import {MarketFactory} from "../src/MarketFactory.sol";
import {PriceRouter} from "../src/PriceRouter.sol";

/// @dev Reuse the same MockUSDC pattern as PredictionMarket.t.sol
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

/// @notice Full test suite for DepegResolver.
///         One section per depeg level, each covering: detection, recovery,
///         escalation, and resolution.
contract DepegResolverTest is Test {

    // ─── Infrastructure ───────────────────────────────────────────────────────

    MockUSDC       usdc;
    PriceRouter    router;
    MarketFactory  factory;
    DepegResolver  resolver;

    address market;

    // Arbitrary feed address used as the registry key
    address constant FEED = address(0xFEED);

    uint256 constant INIT_LIQ = 100e6;  // 100 USDC
    uint256 constant FAR_FUTURE = 2_000_000_000;

    // Chainlink 8-decimal price helpers
    int256 constant PRICE_099  = 99_000_000;  // $0.99 -no depeg
    int256 constant PRICE_096  = 96_500_000;  // $0.965 -level 0
    int256 constant PRICE_094  = 94_000_000;  // $0.94  -level 1
    int256 constant PRICE_088  = 88_000_000;  // $0.88  -level 2
    int256 constant PRICE_075  = 75_000_000;  // $0.75  -level 3

    // ─── Setup ────────────────────────────────────────────────────────────────

    function setUp() public {
        // Start at a well-defined block number so arithmetic is clear
        vm.roll(1000);

        usdc    = new MockUSDC();
        router  = new PriceRouter(address(this));
        factory = new MarketFactory(address(usdc), address(router));
        router.grantMarketRegistrar(address(factory));

        resolver = new DepegResolver(address(factory), address(router), address(usdc));

        // DepegResolver needs MARKET_CREATOR_ROLE to call factory.createMarket()
        factory.grantMarketCreator(address(resolver));

        // Fund this test contract with USDC and approve resolver
        usdc.mint(address(this), 10_000e6);
        usdc.approve(address(resolver), type(uint256).max);

        // Create a market -resolver becomes the owner of the PredictionMarket
        market = resolver.createMarket(
            "Will DAI depeg before 2026?",
            "DEPEG",
            FAR_FUTURE,
            INIT_LIQ,
            FEED
        );
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    function _state() internal view returns (uint8 level, uint64 startBlock, bool active) {
        (level, startBlock, active) = resolver.depegStates(market);
    }

    function _isResolved() internal view returns (bool) {
        return PredictionMarket(payable(market)).resolved();
    }

    function _yesWins() internal view returns (bool) {
        return PredictionMarket(payable(market)).yesWins();
    }

    // ─── Sanity ───────────────────────────────────────────────────────────────

    function test_Setup_ResolverOwnsMarket() public view {
        assertEq(PredictionMarket(payable(market)).owner(), address(resolver));
    }

    function test_Setup_MarketRegisteredInRouter() public view {
        address[] memory markets = router.getMarketsForFeed(FEED);
        assertEq(markets.length, 1);
        assertEq(markets[0], market);
    }

    function test_Setup_NoDepegStateInitially() public view {
        (, , bool active) = _state();
        assertFalse(active);
    }

    function test_NoPriceAboveRecovery_NoStateChange() public {
        resolver.evaluate(FEED, PRICE_099); // $0.99 -healthy
        (, , bool active) = _state();
        assertFalse(active);
        assertFalse(_isResolved());
    }

    // ─── Level 0 (< $0.97, 20 blocks) ────────────────────────────────────────

    function test_Level0_Detection() public {
        resolver.evaluate(FEED, PRICE_096);

        (uint8 level, uint64 startBlock, bool active) = _state();
        assertTrue(active,                "window should be open");
        assertEq(level,      0,           "detected level 0");
        assertEq(startBlock, 1000,        "startBlock is current block");
        assertFalse(_isResolved(),        "not yet resolved");
    }

    function test_Level0_Recovery() public {
        resolver.evaluate(FEED, PRICE_096);     // open window
        resolver.evaluate(FEED, PRICE_099);     // price recovers above $0.97

        (, , bool active) = _state();
        assertFalse(active,         "state cleared on recovery");
        assertFalse(_isResolved(),  "market not resolved");
    }

    function test_Level0_Escalation_ToLevel1() public {
        resolver.evaluate(FEED, PRICE_096);             // open at level 0
        (,uint64 startBlock0,) = _state();

        vm.roll(1005);                                   // 5 blocks later
        resolver.evaluate(FEED, PRICE_094);             // escalate to level 1

        (uint8 level, uint64 startBlock1, bool active) = _state();
        assertTrue(active,                    "window still open");
        assertEq(level,       1,              "escalated to level 1");
        assertEq(startBlock1, 1005,           "startBlock reset to escalation block");
        assertGt(startBlock1, startBlock0,    "startBlock moved forward");
        assertFalse(_isResolved(),            "not resolved -new 10-block window started");
    }

    function test_Level0_NoDowngrade() public {
        // Detect at level 1, then price recovers partially to level 0 territory
        resolver.evaluate(FEED, PRICE_094);             // level 1
        (uint8 levelBefore, uint64 sbBefore,) = _state();

        vm.roll(1003);
        resolver.evaluate(FEED, PRICE_096);             // $0.965 -level 0, but < $0.97

        (uint8 levelAfter, uint64 sbAfter, bool active) = _state();
        assertTrue(active,                       "still in depeg window");
        assertEq(levelAfter,  levelBefore,       "level did not downgrade");
        assertEq(sbAfter,     sbBefore,          "startBlock unchanged on partial recovery");
    }

    function test_Level0_Resolution() public {
        resolver.evaluate(FEED, PRICE_096);         // block 1000 -window opens

        vm.roll(1019);                               // 19 blocks elapsed
        resolver.evaluate(FEED, PRICE_096);
        assertFalse(_isResolved(), "19 blocks -not yet resolved");

        vm.roll(1020);                               // 20 blocks elapsed
        resolver.evaluate(FEED, PRICE_096);
        assertTrue(_isResolved(),  "20 blocks -resolved");
        assertTrue(_yesWins(),     "YES wins on depeg");
    }

    // ─── Level 1 (< $0.95, 10 blocks) ────────────────────────────────────────

    function test_Level1_Detection() public {
        resolver.evaluate(FEED, PRICE_094);

        (uint8 level, uint64 startBlock, bool active) = _state();
        assertTrue(active);
        assertEq(level,      1);
        assertEq(startBlock, 1000);
        assertFalse(_isResolved());
    }

    function test_Level1_Recovery() public {
        resolver.evaluate(FEED, PRICE_094);
        resolver.evaluate(FEED, PRICE_099);

        (, , bool active) = _state();
        assertFalse(active,         "state cleared");
        assertFalse(_isResolved(),  "not resolved");
    }

    function test_Level1_Escalation_ToLevel2() public {
        resolver.evaluate(FEED, PRICE_094);             // level 1
        (,uint64 startBlock1,) = _state();

        vm.roll(1004);
        resolver.evaluate(FEED, PRICE_088);             // escalate to level 2

        (uint8 level, uint64 startBlock2, bool active) = _state();
        assertTrue(active);
        assertEq(level,        2);
        assertEq(startBlock2,  1004);
        assertGt(startBlock2,  startBlock1, "startBlock reset");
        assertFalse(_isResolved(), "3-block window just opened");
    }

    function test_Level1_Resolution() public {
        resolver.evaluate(FEED, PRICE_094);             // block 1000

        vm.roll(1009);
        resolver.evaluate(FEED, PRICE_094);
        assertFalse(_isResolved(), "9 blocks -not yet");

        vm.roll(1010);
        resolver.evaluate(FEED, PRICE_094);
        assertTrue(_isResolved(), "10 blocks -resolved");
        assertTrue(_yesWins());
    }

    // ─── Level 2 (< $0.90, 3 blocks) ─────────────────────────────────────────

    function test_Level2_Detection() public {
        resolver.evaluate(FEED, PRICE_088);

        (uint8 level, uint64 startBlock, bool active) = _state();
        assertTrue(active);
        assertEq(level,      2);
        assertEq(startBlock, 1000);
        assertFalse(_isResolved());
    }

    function test_Level2_Recovery() public {
        resolver.evaluate(FEED, PRICE_088);
        resolver.evaluate(FEED, PRICE_099);

        (, , bool active) = _state();
        assertFalse(active);
        assertFalse(_isResolved());
    }

    function test_Level2_Escalation_ToLevel3() public {
        resolver.evaluate(FEED, PRICE_088);             // level 2
        (,uint64 startBlock2,) = _state();

        vm.roll(1002);
        resolver.evaluate(FEED, PRICE_075);             // escalate to level 3

        (uint8 level, uint64 startBlock3, bool active) = _state();
        assertTrue(active);
        assertEq(level,        3);
        assertEq(startBlock3,  1002);
        assertGt(startBlock3,  startBlock2, "startBlock reset to escalation block");
        // Level 3 requires 1 block; 1002 - 1002 = 0 < 1 -not yet resolved
        assertFalse(_isResolved(), "1-block window just opened");
    }

    function test_Level2_Resolution() public {
        resolver.evaluate(FEED, PRICE_088);             // block 1000

        vm.roll(1002);
        resolver.evaluate(FEED, PRICE_088);
        assertFalse(_isResolved(), "2 blocks -not yet");

        vm.roll(1003);
        resolver.evaluate(FEED, PRICE_088);
        assertTrue(_isResolved(), "3 blocks -resolved");
        assertTrue(_yesWins());
    }

    // ─── Level 3 (< $0.80, 1 block) ──────────────────────────────────────────

    function test_Level3_Detection() public {
        resolver.evaluate(FEED, PRICE_075);

        (uint8 level, uint64 startBlock, bool active) = _state();
        assertTrue(active);
        assertEq(level,      3);
        assertEq(startBlock, 1000);
        // 0 elapsed < 1 required -not yet resolved in the same block
        assertFalse(_isResolved(), "requires at least 1 block to have passed");
    }

    function test_Level3_Recovery_SameBlock() public {
        // Level 3 still allows recovery if price comes back before the next block
        resolver.evaluate(FEED, PRICE_075);     // open window at block 1000
        resolver.evaluate(FEED, PRICE_099);     // recover in same block

        (, , bool active) = _state();
        assertFalse(active,         "state cleared");
        assertFalse(_isResolved(),  "not resolved");
    }

    function test_Level3_NoEscalationBeyondMax() public {
        // Start at level 0, price craters to level 3 -direct escalation to max
        resolver.evaluate(FEED, PRICE_096);             // level 0

        vm.roll(1003);
        resolver.evaluate(FEED, PRICE_075);             // direct jump to level 3

        (uint8 level, uint64 startBlock, bool active) = _state();
        assertTrue(active);
        assertEq(level,      3,    "at max level 3");
        assertEq(startBlock, 1003, "startBlock reset to escalation block");

        // A second call at level 3 price in the same block must NOT re-escalate or reset
        resolver.evaluate(FEED, PRICE_075);
        (, uint64 sbAfter,) = _state();
        assertEq(sbAfter, 1003, "startBlock unchanged when level is already at max");
    }

    function test_Level3_Resolution() public {
        resolver.evaluate(FEED, PRICE_075);     // block 1000 -window opens

        // Same block: 0 elapsed < 1 required
        assertFalse(_isResolved(), "same block -not resolved");

        vm.roll(1001);                          // 1 block elapsed
        resolver.evaluate(FEED, PRICE_075);
        assertTrue(_isResolved(), "1 block elapsed -resolved");
        assertTrue(_yesWins(),    "YES wins");
    }

    // ─── Admin functions ──────────────────────────────────────────────────────

    function test_ForceResolve_YesWins() public {
        resolver.forceResolve(market, true);
        assertTrue(_isResolved());
        assertTrue(_yesWins());
    }

    function test_ForceResolve_NoWins() public {
        resolver.forceResolve(market, false);
        assertTrue(_isResolved());
        assertFalse(_yesWins());
    }

    function test_ForceResolve_OnlyOwner() public {
        vm.prank(address(0xBAD));
        vm.expectRevert();
        resolver.forceResolve(market, true);
    }

    function test_SetLevelConfig_UpdatesThreshold() public {
        resolver.setLevelConfig(0, 98_000_000, 25);
        (uint256 threshold, uint64 requiredBlocks) = resolver.levels(0);
        assertEq(threshold,      98_000_000);
        assertEq(requiredBlocks, 25);
    }

    function test_SetLevelConfig_InvalidIndex() public {
        vm.expectRevert(DepegResolver.InvalidLevelIndex.selector);
        resolver.setLevelConfig(4, 97_000_000, 20);
    }

    function test_Evaluate_InvalidPrice() public {
        vm.expectRevert(DepegResolver.InvalidPrice.selector);
        resolver.evaluate(FEED, 0);

        vm.expectRevert(DepegResolver.InvalidPrice.selector);
        resolver.evaluate(FEED, -1);
    }

    function test_Evaluate_SkipsAlreadyResolvedMarket() public {
        // Resolve first via forceResolve
        resolver.forceResolve(market, false);
        assertTrue(_isResolved());

        // Open a fake state (simulate stale state by calling forceResolve first and
        // then checking that evaluate cleans up without reverting)
        // The contract deletes stale state on the next evaluate call
        resolver.evaluate(FEED, PRICE_075); // should not revert or re-resolve
        (, , bool active) = _state();
        assertFalse(active, "stale state cleaned up on resolved market");
    }
}
