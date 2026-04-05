// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IMarketFactory {
    function createMarket(
        string calldata question,
        string calldata category,
        uint256 resolutionDeadline,
        uint256 initialLiquidityUsdc,
        address priceFeed
    ) external returns (address market);
}
