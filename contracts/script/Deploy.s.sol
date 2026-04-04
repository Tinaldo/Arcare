// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Script, console2} from "forge-std/Script.sol";
import {MarketFactory} from "../src/MarketFactory.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";

/// @notice Deploy MarketFactory to Arc Testnet and seed two initial markets.
///
/// Usage:
///   forge script script/Deploy.s.sol:Deploy \
///     --rpc-url arc_testnet \
///     --account deployer \
///     --broadcast
///
/// Arc Testnet native USDC address: confirm from Circle docs / testnet faucet.
contract Deploy is Script {
    // Arc Testnet native USDC — update if different on testnet
    address constant ARC_TESTNET_USDC = 0x36000000000000000000000000000000000000Ff;

    // Initial liquidity per seeded market (10 USDC for testnet demos)
    uint256 constant SEED_LIQUIDITY = 10e6;

    function run() external {
        vm.startBroadcast();

        // 1. Deploy factory
        MarketFactory factory = new MarketFactory(ARC_TESTNET_USDC);
        console2.log("MarketFactory deployed:", address(factory));

        // 2. Approve factory to pull USDC for initial markets
        IERC20(ARC_TESTNET_USDC).approve(address(factory), type(uint256).max);

        // 3. Seed market 1: USDC depeg
        address market1 = factory.createMarket(
            "Will USDC depeg below $0.99 before June 1, 2026?",
            "DEPEG",
            1_748_736_000, // 2025-06-01 00:00:00 UTC
            SEED_LIQUIDITY
        );
        console2.log("Depeg market deployed:", market1);

        // 4. Seed market 2: Protocol hack
        address market2 = factory.createMarket(
            "Will a major DeFi protocol on Arc Testnet suffer a hack > $1M before June 1, 2026?",
            "HACK",
            1_748_736_000,
            SEED_LIQUIDITY
        );
        console2.log("Hack market deployed:", market2);

        vm.stopBroadcast();

        console2.log("\n--- Copy these to frontend/.env.local ---");
        console2.log("NEXT_PUBLIC_MARKET_FACTORY_ADDRESS=", address(factory));
        console2.log("NEXT_PUBLIC_ARC_USDC_ADDRESS=", ARC_TESTNET_USDC);
    }
}
