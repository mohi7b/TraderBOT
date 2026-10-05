// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title  NAVToken
 * @author NAV Ecosystem
 * @notice NAV Ecosystem Token (symbol: NAV) - an ERC20 token with a fixed
 *         maximum supply of 100,000,000,000 (100 billion) tokens (18 decimals).
 *
 *         Tokens are never minted in the constructor. Instead, the owner
 *         (the presale / treasury contract) issues tokens on demand through
 *         {mintDirect}. Every wallet that receives tokens directly from the
 *         owner is marked as "first-hand" and gets a redemption quota tracked
 *         in {firstHandEligibility}. As soon as such a wallet transfers (or
 *         otherwise sends out) tokens, its quota is reduced proportionally,
 *         so the first-hand attribute is reset after moving/selling tokens.
 *
 *         The redemption lock of the treasury is anchored to
 *         {lastDirectMintAt}, i.e. the timestamp of the most recent direct
 *         issuance to a wallet. Whenever the issuer quotes a lock period
 *         through {mintDirectWithLock} - which is how the presale sells a
 *         sub-phase - the resulting {redemptionLockExpiresAt} is recorded as
 *         well, and a recorded lock is never shortened. Tokens leave the
 *         circulating supply only through burns, which may be performed by the
 *         owner, by the holder itself, or by an address registered as a burner
 *         through {setBurner} (typically the treasury contract).
 */
contract NAVToken is ERC20, Ownable {
    /// @notice Hard cap on the total supply: 100,000,000,000 tokens * 1e18.
    uint256 public constant MAX_SUPPLY = 100_000_000_000 * 10 ** 18;

    /// @notice Redemption quota ("first-hand eligibility") per wallet.
    ///         A wallet that never spent its tokens keeps its original quota.
    mapping(address => uint256) public firstHandEligibility;

    /// @notice Timestamp of the most recent direct (first-hand) issuance to a
    ///         wallet. The treasury uses it as the anchor of its redemption
    ///         lock period, so every fresh direct mint restarts that lock.
    mapping(address => uint256) public lastDirectMintAt;

    /// @notice Explicit redemption lock recorded for a wallet at issuance time.
    ///         The presale fills it with `purchase timestamp + lock period of the
    ///         sub-phase` through {mintDirectWithLock}, and the treasury gates
    ///         {Treasury-redeem} on it. A recorded lock is never shortened and is
    ///         only ever moved forward. Zero means "no explicit lock recorded":
    ///         the treasury then falls back to {lastDirectMintAt} plus its own
    ///         lock period.
    mapping(address => uint256) public redemptionLockExpiresAt;

    /// @notice Addresses allowed to burn first-hand tokens held by somebody else
    ///         (in addition to the owner and the holder itself). The treasury
    ///         registers itself here to process redemptions.
    mapping(address => bool) public isBurner;

    /**
     * @notice Emitted when the owner issues first-hand tokens through {mintDirect}.
     * @param to                Receiver of the freshly issued tokens.
     * @param amount            Number of tokens issued (18 decimals).
     * @param totalEligibility  Receiver's quota after this issuance.
     */
    event DirectMint(address indexed to, uint256 amount, uint256 totalEligibility);

    /**
     * @notice Emitted when the recorded redemption lock of a wallet moves forward
     *         through a direct issuance with an explicit lock.
     * @param account           Wallet whose lock was recorded.
     * @param previousExpiresAt Lock that was recorded before (0 when there was none).
     * @param expiresAt         Lock that is recorded afterwards.
     */
    event RedemptionLockUpdated(
        address indexed account,
        uint256 previousExpiresAt,
        uint256 expiresAt
    );

    /**
     * @notice Emitted when tokens are destroyed through {burnDirect}.
     * @param from                  Wallet the tokens were burned from.
     * @param amount                Number of tokens destroyed (18 decimals).
     * @param remainingEligibility  Sender's first-hand quota after the burn.
     */
    event DirectBurn(address indexed from, uint256 amount, uint256 remainingEligibility);

    /**
     * @notice Emitted when a burner is granted or revoked.
     * @param account Address whose burner status changed.
     * @param status  New burner status.
     */
    event BurnerUpdated(address indexed account, bool status);

    /**
     * @param initialOwner Address that will own the contract (presale / treasury).
     *                     It is the only address allowed to call {mintDirect}.
     */
    constructor(address initialOwner)
        ERC20("NAV Ecosystem Token", "NAV")
        Ownable(initialOwner)
    {}

    /**
     * @notice Issue `amount` brand new tokens directly to `to` and record the
     *         same amount as that wallet's first-hand redemption quota.
     * @dev    Only the owner (presale / treasury) may call this. The total
     *         supply can never exceed {MAX_SUPPLY}.
     * @param  to     Receiver of the new tokens.
     * @param  amount Amount of tokens to mint (18 decimals).
     */
    function mintDirect(address to, uint256 amount) external onlyOwner {
        _mintDirect(to, amount);
    }

    /**
     * @notice Issue `amount` first-hand tokens to `to` and record the redemption
     *         lock the caller quotes for them.
     * @dev    This is the entry point the presale uses: the lock of a purchase is
     *         the lock of the sub-phase it was bought in (the longest one when a
     *         purchase spans several sub-phases), so the treasury can gate
     *         {Treasury-redeem} on the exact timestamp that was valid at purchase
     *         time.
     *
     *         The recorded lock is never shortened: `expiresAt` becomes
     *         `max(block.timestamp + lockPeriod, previously recorded lock)`, so a
     *         wallet can only ever be locked longer than before and never be
     *         unlocked earlier. A zero {redemptionLockExpiresAt} means "no explicit
     *         lock recorded": the treasury then falls back to the classic
     *         {lastDirectMintAt} plus its own lock period.
     *
     * @param  to         Receiver of the new tokens.
     * @param  amount     Amount of tokens to mint (18 decimals).
     * @param  lockPeriod Lock to apply, counted from the current block (seconds).
     * @return expiresAt  Timestamp from which the receiver may redeem.
     */
    function mintDirectWithLock(
        address to,
        uint256 amount,
        uint256 lockPeriod
    ) external onlyOwner returns (uint256 expiresAt) {
        require(
            lockPeriod > 0,
            "NAVToken: lock period must be greater than zero"
        );

        _mintDirect(to, amount);

        uint256 previousExpiresAt = redemptionLockExpiresAt[to];
        expiresAt = block.timestamp + lockPeriod;
        if (expiresAt < previousExpiresAt) {
            expiresAt = previousExpiresAt;
        }
        redemptionLockExpiresAt[to] = expiresAt;

        emit RedemptionLockUpdated(to, previousExpiresAt, expiresAt);
    }

    /**
     * @dev Shared body of {mintDirect} and {mintDirectWithLock}: it mints the
     *      tokens, grows the first-hand quota of the receiver and refreshes the
     *      redemption anchor.
     */
    function _mintDirect(address to, uint256 amount) private {
        require(to != address(0), "NAVToken: mint to the zero address");
        require(amount > 0, "NAVToken: amount must be greater than zero");
        require(
            totalSupply() + amount <= MAX_SUPPLY,
            "NAVToken: exceeds MAX_SUPPLY"
        );

        _mint(to, amount);
        firstHandEligibility[to] += amount;
        // Restart the redemption lock of this wallet: the anchor of the lock
        // period is always the most recent direct issuance.
        lastDirectMintAt[to] = block.timestamp;

        emit DirectMint(to, amount, firstHandEligibility[to]);
    }

    /**
     * @notice Destroy `amount` tokens held by `from`, reducing its first-hand
     *         quota by the same amount (through the {_update} hook).
     * @dev    Callable by the token owner, by a registered burner (see
     *         {setBurner}, typically the treasury during a redemption) or by the
     *         holder itself.
     * @param  from   Wallet the tokens are burned from.
     * @param  amount Amount of tokens to burn (18 decimals).
     */
    function burnDirect(address from, uint256 amount) external {
        require(from != address(0), "NAVToken: burn from the zero address");
        require(amount > 0, "NAVToken: amount must be greater than zero");
        require(
            msg.sender == from || msg.sender == owner() || isBurner[msg.sender],
            "NAVToken: not authorized to burn"
        );

        _burn(from, amount);

        emit DirectBurn(from, amount, firstHandEligibility[from]);
    }

    /**
     * @notice Grant or revoke the right to burn tokens held by other wallets.
     * @param account Address whose burner status changes.
     * @param status  True to grant, false to revoke.
     */
    function setBurner(address account, bool status) external onlyOwner {
        require(account != address(0), "NAVToken: burner is the zero address");
        isBurner[account] = status;
        emit BurnerUpdated(account, status);
    }

    /**
     * @dev Overrides the ERC20 transfer/burn hook (OpenZeppelin v5).
     *
     *      Whenever tokens leave a wallet (`from != address(0)`, i.e. a regular
     *      transfer, transferFrom or burn), the sender's first-hand quota is
     *      reduced by the transferred amount, capped at the current quota, so
     *      that selling/moving tokens resets the first-hand attribute.
     *
     *      Minting (`from == address(0)`) leaves the sender untouched, so the
     *      quota granted by {mintDirect} is preserved.
     */
    function _update(
        address from,
        address to,
        uint256 value
    ) internal virtual override {
        if (from != address(0)) {
            uint256 eligibility = firstHandEligibility[from];
            if (eligibility > 0) {
                uint256 reduction = value < eligibility ? value : eligibility;
                unchecked {
                    firstHandEligibility[from] = eligibility - reduction;
                }
            }
        }

        super._update(from, to, value);
    }
}
