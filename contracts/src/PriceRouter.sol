// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title PriceRouter
/// @notice Maintains a registry of which markets are associated with which price feed.
///         Intended to be optional infrastructure around MarketFactory.
contract PriceRouter is AccessControl {
    bytes32 public constant MARKET_REGISTRAR_ROLE = keccak256("MARKET_REGISTRAR_ROLE");

    mapping(address => address[]) private marketsByFeed;
    mapping(address => address) public feedByMarket;
    mapping(address => uint256) private marketIndexByAddress;

    event MarketRegistered(address indexed priceFeed, address indexed market);
    event MarketUnregistered(address indexed priceFeed, address indexed market);

    error InvalidPriceFeed();
    error InvalidMarket();
    error MarketAlreadyRegistered();
    error UnknownMarket();

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        if (admin != address(0) && admin != msg.sender) {
            _grantRole(DEFAULT_ADMIN_ROLE, admin);
        }
    }

    function grantMarketRegistrar(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(MARKET_REGISTRAR_ROLE, account);
    }

    function revokeMarketRegistrar(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _revokeRole(MARKET_REGISTRAR_ROLE, account);
    }

    function registerMarket(address priceFeed, address market) external onlyRole(MARKET_REGISTRAR_ROLE) {
        if (priceFeed == address(0)) revert InvalidPriceFeed();
        if (market == address(0)) revert InvalidMarket();
        if (feedByMarket[market] != address(0)) revert MarketAlreadyRegistered();

        marketIndexByAddress[market] = marketsByFeed[priceFeed].length;
        marketsByFeed[priceFeed].push(market);
        feedByMarket[market] = priceFeed;

        emit MarketRegistered(priceFeed, market);
    }

    function unregisterMarket(address market) external onlyRole(MARKET_REGISTRAR_ROLE) {
        address priceFeed = feedByMarket[market];
        if (priceFeed == address(0)) revert UnknownMarket();

        uint256 index = marketIndexByAddress[market];
        uint256 lastIndex = marketsByFeed[priceFeed].length - 1;

        if (index != lastIndex) {
            address lastMarket = marketsByFeed[priceFeed][lastIndex];
            marketsByFeed[priceFeed][index] = lastMarket;
            marketIndexByAddress[lastMarket] = index;
        }

        marketsByFeed[priceFeed].pop();
        delete marketIndexByAddress[market];
        delete feedByMarket[market];

        emit MarketUnregistered(priceFeed, market);
    }

    function getMarketsForFeed(address priceFeed) external view returns (address[] memory) {
        return marketsByFeed[priceFeed];
    }

    function getMarketCountForFeed(address priceFeed) external view returns (uint256) {
        return marketsByFeed[priceFeed].length;
    }
}
