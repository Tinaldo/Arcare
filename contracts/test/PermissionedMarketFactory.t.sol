// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console2} from "forge-std/Test.sol";
import {PermissionedMarketFactory} from "../src/PermissionedMarketFactory.sol";

// Mirror events for expectEmit
interface IPermissionedMarketFactory {
    event MarketCreated(uint256 indexed id, string question, address indexed creator);
    event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender);
}

contract PermissionedMarketFactoryTest is Test, IPermissionedMarketFactory {
    PermissionedMarketFactory factory;

    address admin   = makeAddr("admin");
    address creator = makeAddr("creator");
    address rogue   = makeAddr("rogue");

    bytes32 constant MARKET_CREATOR_ROLE = keccak256("MARKET_CREATOR_ROLE");

    function setUp() public {
        factory = new PermissionedMarketFactory(admin);
    }

    // ── Role setup ────────────────────────────────────────────────────────────

    function test_AdminHasDefaultAdminRole() public view {
        assertTrue(factory.hasRole(factory.DEFAULT_ADMIN_ROLE(), admin));
    }

    function test_DeployerNotCreatorByDefault() public view {
        assertFalse(factory.hasRole(MARKET_CREATOR_ROLE, admin));
    }

    // ── grantMarketCreator ────────────────────────────────────────────────────

    function test_AdminCanGrantCreatorRole() public {
        vm.prank(admin);
        factory.grantMarketCreator(creator);
        assertTrue(factory.hasRole(MARKET_CREATOR_ROLE, creator));
    }

    function test_NonAdminCannotGrantRole() public {
        vm.prank(rogue);
        vm.expectRevert();
        factory.grantMarketCreator(creator);
    }

    // ── revokeMarketCreator ───────────────────────────────────────────────────

    function test_AdminCanRevokeCreatorRole() public {
        vm.prank(admin);
        factory.grantMarketCreator(creator);

        vm.prank(admin);
        factory.revokeMarketCreator(creator);

        assertFalse(factory.hasRole(MARKET_CREATOR_ROLE, creator));
    }

    function test_NonAdminCannotRevokeRole() public {
        vm.prank(admin);
        factory.grantMarketCreator(creator);

        vm.prank(rogue);
        vm.expectRevert();
        factory.revokeMarketCreator(creator);
    }

    // ── createMarket ──────────────────────────────────────────────────────────

    function test_CreatorCanCreateMarket() public {
        vm.prank(admin);
        factory.grantMarketCreator(creator);

        vm.prank(creator);
        uint256 id = factory.createMarket("Will USDC depeg below $0.99?");

        assertEq(id, 0);
        assertEq(factory.getMarketCount(), 1);

        PermissionedMarketFactory.Market memory m = factory.getMarket(0);
        assertEq(m.question, "Will USDC depeg below $0.99?");
        assertEq(m.creator, creator);
    }

    function test_RogueCannotCreateMarket() public {
        vm.prank(rogue);
        vm.expectRevert();
        factory.createMarket("I should not be able to do this");
    }

    function test_RevokedCreatorCannotCreateMarket() public {
        vm.prank(admin);
        factory.grantMarketCreator(creator);

        vm.prank(admin);
        factory.revokeMarketCreator(creator);

        vm.prank(creator);
        vm.expectRevert();
        factory.createMarket("Role was revoked - should fail");
    }

    // ── Events ────────────────────────────────────────────────────────────────

    function test_MarketCreatedEventEmitted() public {
        vm.prank(admin);
        factory.grantMarketCreator(creator);

        vm.expectEmit(true, true, false, true);
        emit MarketCreated(0, "Will USDC depeg?", creator);

        vm.prank(creator);
        factory.createMarket("Will USDC depeg?");
    }

    function test_RoleGrantedEventEmitted() public {
        // OZ emits RoleGranted automatically
        vm.expectEmit(true, true, true, true);
        emit RoleGranted(MARKET_CREATOR_ROLE, creator, admin);

        vm.prank(admin);
        factory.grantMarketCreator(creator);
    }

    // ── Multiple markets ──────────────────────────────────────────────────────

    function test_MultipleMarketsIndexCorrectly() public {
        vm.prank(admin);
        factory.grantMarketCreator(creator);

        vm.startPrank(creator);
        factory.createMarket("Market A");
        factory.createMarket("Market B");
        factory.createMarket("Market C");
        vm.stopPrank();

        assertEq(factory.getMarketCount(), 3);
        assertEq(factory.getMarket(2).question, "Market C");
    }

    // ── Fuzz ──────────────────────────────────────────────────────────────────

    function testFuzz_OnlyCreatorCanCreate(address caller) public {
        vm.assume(caller != address(0));
        // caller does NOT have MARKET_CREATOR_ROLE
        assertFalse(factory.hasRole(MARKET_CREATOR_ROLE, caller));

        vm.prank(caller);
        vm.expectRevert();
        factory.createMarket("fuzz question");
    }
}
