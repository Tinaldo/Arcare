// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {MarketFactory} from "../src/MarketFactory.sol";
import {PriceRouter} from "../src/PriceRouter.sol";

/// @notice Deploy EURC-backed MarketFactory to Arc Testnet.
///
/// Usage:
///   NEXT_PUBLIC_ARC_EURC_ADDRESS=<EURC_TOKEN_ADDRESS> \
///   forge script script/DeployEURC.s.sol --rpc-url https://rpc.testnet.arc.network --account deployer --broadcast -vv
///
/// Or with a private key:
///   NEXT_PUBLIC_ARC_EURC_ADDRESS=<EURC_TOKEN_ADDRESS> \
///   forge script script/DeployEURC.s.sol --rpc-url https://rpc.testnet.arc.network --private-key $PRIVATE_KEY --broadcast -vv
contract DeployEURC is Script {
    function run() external {
        address eurc = vm.envAddress("NEXT_PUBLIC_ARC_EURC_ADDRESS");
        require(eurc != address(0), "NEXT_PUBLIC_ARC_EURC_ADDRESS missing");

        vm.startBroadcast();

        PriceRouter router = new PriceRouter(address(0));
        MarketFactory factory = new MarketFactory(eurc, address(router));
        router.grantMarketRegistrar(address(factory));

        console2.log("PriceRouter deployed:", address(router));
        console2.log("EURC MarketFactory deployed:", address(factory));

        vm.stopBroadcast();

        console2.log("\n--- Copy to frontend/.env.local ---");
        console2.log("NEXT_PUBLIC_EURC_PRICE_ROUTER_ADDRESS=", address(router));
        console2.log("NEXT_PUBLIC_EURC_MARKET_FACTORY_ADDRESS=", address(factory));
        console2.log("NEXT_PUBLIC_ARC_EURC_ADDRESS=", eurc);
    }
}
