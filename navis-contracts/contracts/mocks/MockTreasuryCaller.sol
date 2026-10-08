// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IFlashLoanReceiver} from "../MarketMaker.sol";

/**
 * @title  MockTreasuryCaller
 * @notice Testing helper that plays the role of a (malicious or misconfigured)
 *         treasury: it invokes {MarketMaker-onFlashLoan} with arbitrary
 *         arguments, which lets the test-suite exercise the defensive checks of
 *         the callback that a real treasury can never trigger.
 * @dev    Only used in the Hardhat test-suite.
 */
contract MockTreasuryCaller {
    /// @notice Call `marketMaker.onFlashLoan` with the supplied arguments.
    function callOnFlashLoan(
        address marketMaker,
        address initiator,
        address token,
        uint256 amount,
        uint256 fee,
        bytes calldata data
    ) external {
        IFlashLoanReceiver(marketMaker).onFlashLoan(
            initiator,
            token,
            amount,
            fee,
            data
        );
    }
}
