// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title  ReentrantKeeper
 * @notice Testing helper that plays the role of an arbitrage robot registered as
 *         a keeper of the market maker: it forwards arbitrary calldata to an
 *         arbitrary target, which lets the test-suite re-enter the guarded
 *         strategies from inside a DEX swap (see {ReentrantDEXRouter}).
 * @dev    Only used in the Hardhat test-suite.
 */
contract ReentrantKeeper {
    /**
     * @notice Call `target` with `data`, bubbling up whatever it reverts with.
     * @param target Contract to call, usually the market maker.
     * @param data   ABI encoded call to forward.
     * @return result Raw return data of the forwarded call.
     */
    function execute(
        address target,
        bytes calldata data
    ) external returns (bytes memory result) {
        (bool success, bytes memory reason) = target.call(data);
        if (!success) {
            // Bubble the original error so the test can assert on the exact
            // reason produced by the market maker.
            assembly {
                revert(add(reason, 0x20), mload(reason))
            }
        }
        return reason;
    }
}
