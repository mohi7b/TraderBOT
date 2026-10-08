// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title  MockUSDT
 * @notice Testing helper that mimics the real USDT: a plain ERC20 with 6
 *         decimals and an open {mint}.
 * @dev    Only used in the Hardhat test-suite.
 */
contract MockUSDT is ERC20 {
    constructor() ERC20("Mock USDT", "USDT") {}

    /// @dev USDT uses 6 decimals on every network it is deployed to.
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Unrestricted minting, for test fixtures only.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
