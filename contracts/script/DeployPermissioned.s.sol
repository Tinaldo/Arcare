// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {PermissionedMarketFactory} from "../src/PermissionedMarketFactory.sol";

/// @notice Deploy PermissionedMarketFactory, demonstrate role-based market creation.
///
/// Local demo:
///   anvil                                          # terminal 1 — start local chain
///   forge script script/DeployPermissioned.s.sol \
///     --rpc-url http://localhost:8545 \
///     --private-key <ANVIL_KEY_0> \
///     --broadcast -vv                              # terminal 2 — run script
///
/// Arc Testnet:
///   forge script script/DeployPermissioned.s.sol \
///     --rpc-url arc_testnet \
///     --account deployer \
///     --broadcast -vv
contract DeployPermissioned is Script {
    function run() external {
        // ── Deployer = DEFAULT_ADMIN_ROLE ──────────────────────────────────────
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer    = vm.addr(deployerKey);

        // ── Generate a fresh wallet to act as MARKET_CREATOR ──────────────────
        // In production you'd pass in a real address. Here we derive one
        // deterministically from a known seed so the demo is reproducible.
        uint256 creatorKey  = uint256(keccak256("insurarc.market_creator.demo"));
        address creator     = vm.addr(creatorKey);

        // ── Non-authorized wallet (should fail) ───────────────────────────────
        uint256 rogueKey    = uint256(keccak256("insurarc.rogue.demo"));
        address rogue       = vm.addr(rogueKey);

        console2.log("=== Addresses ===");
        console2.log("Deployer (admin)  :", deployer);
        console2.log("Creator (creator) :", creator);
        console2.log("Rogue (no role)   :", rogue);

        // ── 1. Deploy ──────────────────────────────────────────────────────────
        vm.startBroadcast(deployerKey);
        PermissionedMarketFactory factory = new PermissionedMarketFactory(deployer);
        console2.log("\nPermissionedMarketFactory deployed:", address(factory));

        // ── 2. Admin grants MARKET_CREATOR_ROLE to creator ────────────────────
        factory.grantMarketCreator(creator);
        console2.log("Granted MARKET_CREATOR_ROLE to:", creator);
        vm.stopBroadcast();

        // ── 3. Creator successfully creates a market ───────────────────────────
        vm.startBroadcast(creatorKey);
        uint256 id = factory.createMarket("Will USDC depeg below $0.99 before June 1, 2026?");
        console2.log("\nMarket created by creator. ID:", id);
        vm.stopBroadcast();

        // ── 4. Rogue wallet tries to create a market — must revert ─────────────
        console2.log("\nAttempting createMarket from rogue wallet (expect revert)...");
        vm.startBroadcast(rogueKey);
        try factory.createMarket("I should not be able to do this") {
            console2.log("ERROR: rogue call succeeded - this should not happen!");
        } catch {
            console2.log("Correctly reverted: rogue wallet has no MARKET_CREATOR_ROLE");
        }
        vm.stopBroadcast();

        // ── 5. Admin revokes creator role ──────────────────────────────────────
        vm.startBroadcast(deployerKey);
        factory.revokeMarketCreator(creator);
        console2.log("\nRevoked MARKET_CREATOR_ROLE from:", creator);
        vm.stopBroadcast();

        // ── Summary ────────────────────────────────────────────────────────────
        console2.log("\n=== Final state ===");
        console2.log("Total markets:", factory.getMarketCount());
        console2.log("Creator has role:", factory.hasRole(factory.MARKET_CREATOR_ROLE(), creator));
        console2.log("Rogue has role  :", factory.hasRole(factory.MARKET_CREATOR_ROLE(), rogue));
    }
}
