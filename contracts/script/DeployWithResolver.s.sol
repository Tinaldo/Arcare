// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {MarketFactory} from "../src/MarketFactory.sol";
import {PriceRouter} from "../src/PriceRouter.sol";
import {DepegResolver} from "../src/DepegResolver.sol";

/// @notice Deploy the full InsurArc stack including DepegResolver.
///
/// Usage:
///   forge script script/DeployWithResolver.s.sol \
///     --rpc-url https://rpc.testnet.arc.network \
///     --account deployer \
///     --broadcast -vv
///
/// After deployment, grant DepegResolver MARKET_CREATOR_ROLE:
///   The script does this automatically — no manual step needed.
///
/// Copy the printed addresses into frontend/.env.local.
contract DeployWithResolver is Script {
    address constant ARC_TESTNET_USDC = 0x3600000000000000000000000000000000000000;

    function run() external {
        vm.startBroadcast();

        // 1. Deploy registry
        PriceRouter router = new PriceRouter(address(0));

        // 2. Deploy factory (needs router for price feed registration)
        MarketFactory factory = new MarketFactory(ARC_TESTNET_USDC, address(router));
        router.grantMarketRegistrar(address(factory));

        // 3. Deploy resolver — becomes owner of all markets it creates
        DepegResolver resolver = new DepegResolver(
            address(factory),
            address(router),
            ARC_TESTNET_USDC
        );

        // 4. Grant resolver MARKET_CREATOR_ROLE so it can call factory.createMarket()
        factory.grantMarketCreator(address(resolver));

        vm.stopBroadcast();

        console2.log("PriceRouter   deployed:", address(router));
        console2.log("MarketFactory deployed:", address(factory));
        console2.log("DepegResolver deployed:", address(resolver));

        console2.log("\n--- Copy to frontend/.env.local ---");
        console2.log("NEXT_PUBLIC_PRICE_ROUTER_ADDRESS=",   address(router));
        console2.log("NEXT_PUBLIC_MARKET_FACTORY_ADDRESS=", address(factory));
        console2.log("NEXT_PUBLIC_DEPEG_RESOLVER_ADDRESS=", address(resolver));
        console2.log("NEXT_PUBLIC_ARC_USDC_ADDRESS=",       ARC_TESTNET_USDC);
    }
}
