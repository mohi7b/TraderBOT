// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title  ProtocolPausable
 * @author NAV Ecosystem
 * @notice Shared emergency stop of the NAVIS protocol contracts
 *         ({NAVToken}, {Presale}, {Treasury}).
 *
 *         The stop is deliberately two-keyed. {pause} / {unpause} may be called
 *         by the owner *or* by an address registered through {setPauser}, so the
 *         operation team can freeze the protocol from a hot key while the
 *         ownership of the contracts lives somewhere else (the NAVIS token, for
 *         instance, is owned by the presale after the deployment hand-off).
 *
 *         Only {pause} and {unpause} are delegated: every other administrative
 *         entry point of a pausing contract stays strictly `onlyOwner`, so a
 *         compromised pauser key can freeze the protocol but never move funds,
 *         change parameters or unpause a decision of the owner.
 */
abstract contract ProtocolPausable is Ownable, Pausable {
    /// @notice Addresses allowed to pause and unpause on behalf of the owner.
    mapping(address => bool) public isPauser;

    /**
     * @notice Emitted when the pauser status of an account changes.
     * @param account Address whose pauser status changed.
     * @param status  New pauser status.
     */
    event PauserUpdated(address indexed account, bool status);

    /// @dev Owner or a registered pauser: the only callers of {pause}/{unpause}.
    modifier onlyPauser() {
        require(
            msg.sender == owner() || isPauser[msg.sender],
            "ProtocolPausable: not authorized to pause"
        );
        _;
    }

    /**
     * @notice Grant or revoke the right to pause the contract.
     * @param account Address whose pauser status changes.
     * @param status  True to grant, false to revoke.
     */
    function setPauser(address account, bool status) external onlyOwner {
        require(
            account != address(0),
            "ProtocolPausable: pauser is the zero address"
        );
        isPauser[account] = status;
        emit PauserUpdated(account, status);
    }

    /// @notice Stop the pausable entry points of the contract (owner or pauser).
    function pause() external onlyPauser {
        _pause();
    }

    /// @notice Resume the pausable entry points of the contract (owner or pauser).
    function unpause() external onlyPauser {
        _unpause();
    }
}
