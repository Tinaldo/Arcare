// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IPredictionMarket {
    function resolve(bool yesWins) external;
    function resolved() external view returns (bool);
    function yesWins() external view returns (bool);
    function resolutionDeadline() external view returns (uint256);
    function lpShares(address account) external view returns (uint256);
    function removeLiquidity(uint256 shares) external;
}
