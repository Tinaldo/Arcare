// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {MarketFactory} from "../src/MarketFactory.sol";
import {PriceRouter} from "../src/PriceRouter.sol";

/// @notice Deploy MarketFactory to Arc Testnet.
///
/// Usage:
///   forge script script/Deploy.s.sol --rpc-url https://rpc.testnet.arc.network --account deployer --broadcast -vv
contract Deploy is Script {
    address constant ARC_TESTNET_USDC = 0x3600000000000000000000000000000000000000;

    function run() external {
        vm.startBroadcast();

        PriceRouter router = new PriceRouter(address(0));
        MarketFactory factory = new MarketFactory(ARC_TESTNET_USDC, address(router));
        router.grantMarketRegistrar(address(factory));

        console2.log("PriceRouter deployed:", address(router));
        console2.log("MarketFactory deployed:", address(factory));

        vm.stopBroadcast();

        console2.log("\n--- Copy to frontend/.env.local ---");
        console2.log("NEXT_PUBLIC_PRICE_ROUTER_ADDRESS=", address(router));
        console2.log("NEXT_PUBLIC_MARKET_FACTORY_ADDRESS=", address(factory));
        console2.log("NEXT_PUBLIC_ARC_USDC_ADDRESS=", ARC_TESTNET_USDC);
    }
}
