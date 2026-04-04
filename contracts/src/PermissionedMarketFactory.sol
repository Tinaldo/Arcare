// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title PermissionedMarketFactory
/// @notice Polymarket-style permissioned market creation using OpenZeppelin AccessControl.
///         Only accounts with MARKET_CREATOR_ROLE can create markets.
///         DEFAULT_ADMIN_ROLE controls who can grant/revoke MARKET_CREATOR_ROLE.
contract PermissionedMarketFactory is AccessControl {
    // ─── Roles ────────────────────────────────────────────────────────────────

    bytes32 public constant MARKET_CREATOR_ROLE = keccak256("MARKET_CREATOR_ROLE");

    // ─── State ────────────────────────────────────────────────────────────────

    struct Market {
        uint256 id;
        string question;
        address creator;
        uint256 createdAt;
    }

    Market[] public markets;

    // ─── Events ───────────────────────────────────────────────────────────────

    // Note: RoleGranted and RoleRevoked are already emitted by OZ AccessControl.
    event MarketCreated(uint256 indexed id, string question, address indexed creator);

    // ─── Constructor ──────────────────────────────────────────────────────────

    /// @param admin Address that receives DEFAULT_ADMIN_ROLE (and can grant/revoke MARKET_CREATOR_ROLE)
    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    // ─── Market creation ──────────────────────────────────────────────────────

    /// @notice Create a new prediction market. Caller must have MARKET_CREATOR_ROLE.
    /// @param question Human-readable question, e.g. "Will USDC depeg below $0.99 by Dec 31?"
    /// @return id Index of the newly created market
    function createMarket(string calldata question) external onlyRole(MARKET_CREATOR_ROLE) returns (uint256 id) {
        id = markets.length;
        markets.push(Market({
            id: id,
            question: question,
            creator: msg.sender,
            createdAt: block.timestamp
        }));
        emit MarketCreated(id, question, msg.sender);
    }

    // ─── Role management (wrappers for readability) ───────────────────────────

    /// @notice Grant MARKET_CREATOR_ROLE to an address. Only DEFAULT_ADMIN_ROLE.
    function grantMarketCreator(address user) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(MARKET_CREATOR_ROLE, user);
    }

    /// @notice Revoke MARKET_CREATOR_ROLE from an address. Only DEFAULT_ADMIN_ROLE.
    function revokeMarketCreator(address user) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _revokeRole(MARKET_CREATOR_ROLE, user);
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    function getMarketCount() external view returns (uint256) {
        return markets.length;
    }

    function getMarket(uint256 id) external view returns (Market memory) {
        return markets[id];
    }
}
