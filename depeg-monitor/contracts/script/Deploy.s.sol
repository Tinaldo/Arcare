// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {InsurArcPriceFeed} from "../src/InsurArcPriceFeed.sol";

contract Deploy is Script {
    // KeystoneForwarder on Arc testnet
    address constant FORWARDER = 0x6E9EE680ef59ef64Aa8C7371279c27E496b5eDc1;

    function run() external {
        vm.startBroadcast();

        InsurArcPriceFeed feed = new InsurArcPriceFeed(FORWARDER);

        console.log("InsurArcPriceFeed deployed at:", address(feed));
        console.log("Forwarder set to:", FORWARDER);

        vm.stopBroadcast();
    }
}
