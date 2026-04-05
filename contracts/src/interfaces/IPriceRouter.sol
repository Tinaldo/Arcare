// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IPriceRouter {
    function getMarketsForFeed(address priceFeed) external view returns (address[] memory);
}
