// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {MockDEXRouter} from "./MockDEXRouter.sol";

/**
 * @title  ReentrantDEXRouter
 * @notice Testing helper: a {MockDEXRouter} that, in the middle of a swap, calls
 *         an arbitrary contract with an arbitrary payload. Used to prove that
 *         the market maker cannot be re-entered while it is running an
 *         arbitrage or a liquidity rebalance.
 * @dev    Only used in the Hardhat test-suite.
 */
contract ReentrantDEXRouter is MockDEXRouter {
    /// @notice Contract called back during the swap (address(0) disables it).
    address public reentryTarget;

    /// @notice Payload used for the re-entrant call.
    bytes public reentryData;

    /**
     * @param usdt_     Address of the USDT token.
     * @param navToken_ Address of the NAVIS token.
     */
    constructor(address usdt_, address navToken_) MockDEXRouter(usdt_, navToken_) {}

    /// @notice Configure the re-entrant call performed during the swap.
    function setReentry(address target, bytes calldata data) external {
        reentryTarget = target;
        reentryData = data;
    }

    /// @notice Disable the re-entrant call.
    function clearReentry() external {
        reentryTarget = address(0);
        delete reentryData;
    }

    /**
     * @notice Call an arbitrary contract with an arbitrary payload.
     * @dev    Used by the test-suite to reach the market maker callback with
     *         arguments a real treasury would never produce.
     */
    function execute(
        address target,
        bytes calldata data
    ) external returns (bytes memory) {
        (bool success, bytes memory result) = target.call(data);
        if (!success) {
            // Bubble the original error so the test can assert on the exact
            // reason produced by the market maker.
            assembly {
                revert(add(result, 0x20), mload(result))
            }
        }
        return result;
    }

    /// @dev Performs the configured re-entrant call after the swap is settled.
    function _afterSwap() internal override {
        address target = reentryTarget;
        if (target == address(0)) {
            return;
        }

        (bool success, bytes memory reason) = target.call(reentryData);
        if (!success) {
            assembly {
                revert(add(reason, 0x20), mload(reason))
            }
        }
    }
}
