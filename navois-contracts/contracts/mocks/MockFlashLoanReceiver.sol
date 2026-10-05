// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @dev Interface a whitelisted arbitrage contract must implement to receive a
 *      USDT flash loan from the treasury.
 */
interface IFlashLoanCallback {
    function onFlashLoan(
        address initiator,
        address token,
        uint256 amount,
        uint256 fee,
        bytes calldata data
    ) external;
}

/**
 * @title  MockFlashLoanReceiver
 * @notice Testing helper that plays the role of a whitelisted arbitrage robot:
 *         it records the loan it receives and returns the USDT to the treasury,
 *         with a configurable repayment amount so that the test-suite can prove
 *         the "full repayment" requirement.
 * @dev    Only used in the Hardhat test-suite.
 *
 *         Repayment rules:
 *           - `useRepayAmount == false` (default): send back `amount + bonus`;
 *           - `useRepayAmount == true`: send back exactly `repayAmount`, which
 *             allows modelling under-payment (e.g. 0) as well;
 *           - `revertInCallback`: make the whole flash loan revert;
 *           - `reentryTarget != address(0)`: call an arbitrary contract with
 *             `reentryData` before repaying and bubble any revert, used to prove
 *             that the treasury re-entrancy guard works.
 */
contract MockFlashLoanReceiver is IFlashLoanCallback {
    using SafeERC20 for IERC20;

    /// @notice Loaned token (USDT).
    IERC20 public immutable usdt;

    /// @notice When true, exactly {repayAmount} is returned to the treasury.
    bool public useRepayAmount;

    /// @notice Absolute amount returned when {useRepayAmount} is true.
    uint256 public repayAmount;

    /// @notice Extra USDT returned on top of the loan when {useRepayAmount} is false.
    uint256 public bonus;

    /// @notice When true the callback reverts on purpose.
    bool public revertInCallback;

    /// @notice Contract called back before repaying (address(0) disables it).
    address public reentryTarget;

    /// @notice Payload used for the re-entrant call.
    bytes public reentryData;

    /// @notice Initiator of the most recent loan.
    address public lastInitiator;

    /// @notice Token of the most recent loan.
    address public lastToken;

    /// @notice Amount of the most recent loan.
    uint256 public lastAmount;

    /// @notice Fee charged on the most recent loan.
    uint256 public lastFee;

    /// @notice Arbitrary payload of the most recent loan.
    bytes public lastData;

    /// @notice Emitted for every received loan, including the forwarded payload.
    event FlashLoanReceived(
        address indexed initiator,
        address indexed token,
        uint256 amount,
        uint256 fee,
        bytes data
    );

    constructor(address usdt_) {
        require(usdt_ != address(0), "MockFlashLoanReceiver: USDT is the zero address");
        usdt = IERC20(usdt_);
    }

    /// @notice Configure how much USDT is sent back to the treasury.
    function setRepayment(
        bool useRepayAmount_,
        uint256 repayAmount_,
        uint256 bonus_
    ) external {
        useRepayAmount = useRepayAmount_;
        repayAmount = repayAmount_;
        bonus = bonus_;
    }

    /// @notice Force the callback to revert.
    function setRevertInCallback(bool value) external {
        revertInCallback = value;
    }

    /// @notice Configure the re-entrant call performed before repaying.
    function setReentry(address target, bytes calldata data) external {
        reentryTarget = target;
        reentryData = data;
    }

    /**
     * @dev Records the loan, optionally forces a revert or a re-entrant call and
     *      finally returns the configured amount of USDT to the treasury
     *      (`msg.sender` of this callback is the treasury itself).
     */
    function onFlashLoan(
        address initiator,
        address token,
        uint256 amount,
        uint256 fee,
        bytes calldata data
    ) external override {
        lastInitiator = initiator;
        lastToken = token;
        lastAmount = amount;
        lastFee = fee;
        lastData = data;

        emit FlashLoanReceived(initiator, token, amount, fee, data);

        require(!revertInCallback, "MockFlashLoanReceiver: forced revert");

        if (reentryTarget != address(0)) {
            (bool success, bytes memory reason) = reentryTarget.call(reentryData);
            if (!success) {
                // Bubble the original error so that the test can assert on the
                // exact reason produced by the treasury.
                assembly {
                    revert(add(reason, 0x20), mload(reason))
                }
            }
        }

        uint256 repayment = useRepayAmount ? repayAmount : amount + bonus;
        if (repayment > 0) {
            usdt.safeTransfer(msg.sender, repayment);
        }
    }
}
