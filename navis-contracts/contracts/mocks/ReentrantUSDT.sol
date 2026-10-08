// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @dev Minimal surface of {Presale} used to attempt a re-entrant call.
 */
interface IPresaleBuy {
    function buyTokens(uint256 usdtAmount) external returns (uint256);
}

/**
 * @title  ReentrantUSDT
 * @notice Malicious USDT look-alike used to prove that {Presale-buyTokens} is
 *         protected by the {ReentrancyGuard} modifier. On every {transferFrom}
 *         whose sender is the transaction originator it tries to re-enter the
 *         presale before performing the real transfer.
 * @dev    Only used in the Hardhat test-suite.
 */
contract ReentrantUSDT is ERC20 {
    /// @notice Address of the presale under attack.
    address public presale;

    constructor() ERC20("Reentrant USDT", "rUSDT") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Point the token at the presale that must be re-entered.
    function setPresale(address presale_) external {
        presale = presale_;
    }

    /// @notice Unrestricted minting, for test fixtures only.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /**
     * @dev Attempts to re-enter {Presale-buyTokens} while the outer presale call
     *      is still executing. The re-entrant call reverts with
     *      `ReentrancyGuardReentrantCall`, which bubbles up and reverts the
     *      whole purchase.
     */
    function transferFrom(
        address from,
        address to,
        uint256 value
    ) public override returns (bool) {
        if (presale != address(0) && from == tx.origin) {
            IPresaleBuy(presale).buyTokens(1e6);
        }
        return super.transferFrom(from, to, value);
    }
}
