// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @dev Minimal view of the NAVIS token needed by the treasury: the standard
 *      ERC20 surface plus the first-hand accounting, the redemption lock
 *      recorded at issuance time and the burn entry point.
 */
interface INAVToken is IERC20 {
    function firstHandEligibility(address account) external view returns (uint256);

    function lastDirectMintAt(address account) external view returns (uint256);

    function redemptionLockExpiresAt(
        address account
    ) external view returns (uint256);

    function burnDirect(address from, uint256 amount) external;
}

/**
 * @dev Interface a whitelisted arbitrage / market-maker contract must implement
 *      to receive a USDT flash loan.
 */
interface IFlashLoanReceiver {
    /**
     * @param initiator Address that triggered the flash loan.
     * @param token     Address of the loaned token (USDT).
     * @param amount    Amount of USDT loaned.
     * @param fee       Fee charged on top of the loan (always 0).
     * @param data      Arbitrary payload forwarded from the caller.
     */
    function onFlashLoan(
        address initiator,
        address token,
        uint256 amount,
        uint256 fee,
        bytes calldata data
    ) external;
}

/**
 * @title  Treasury
 * @author NAV Ecosystem
 * @notice USDT reserve of the NAVIS protocol. It holds the reserve that backs the
 *         NAV Floor, pays first-hand redemptions and issues zero-fee USDT flash
 *         loans to whitelisted arbitrage bots that defend the floor.
 *
 *         Pricing rule (identical to {Presale}):
 *
 *             NAV_Floor = treasuryUSDTBalance * 1e18 / navisTotalSupply
 *
 *         Redemption rule: after the lock period has elapsed, a first-hand
 *         wallet can burn its NAVIS and receive the floor value of those tokens
 *         in USDT:
 *
 *             usdtOut = tokenAmount * NAV_Floor / 1e18
 *
 *         The lock of a wallet is the one the presale recorded for it when it
 *         bought ({INAVToken-redemptionLockExpiresAt}, i.e. the purchase
 *         timestamp plus the lock period of the sub-phase that was sold there).
 *         For wallets without such a record - tokens issued outside the presale
 *         - the treasury falls back to its own {lockPeriod}, counted from the
 *         most recent direct issuance ({INAVToken-lastDirectMintAt}).
 *
 *         Burning reduces the total supply, which raises the floor for the
 *         remaining holders, while paying out the reserve keeps the ratio
 *         anchored to the value that was valid before the burn.
 *
 * @dev    Amount conventions:
 *           - USDT amounts are expressed in the token's own base units (6 for
 *             the real USDT);
 *           - NAVIS amounts are expressed in 1e18 base units (18 decimals).
 */
contract Treasury is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Fixed scale of a whole NAVIS token (18 decimals).
    uint256 public constant NAVIS_SCALE = 1e18;

    /// @notice NAVIS token whose supply is redeemed and burned (it stays owned by
    ///         the presale, so the treasury registers itself as a burner).
    INAVToken public immutable navToken;

    /// @notice Reserve token (USDT).
    IERC20 public immutable usdt;

    /// @notice Fallback lock period of the reserve: it must elapse after the most
    ///         recent direct issuance to a wallet before that wallet can redeem
    ///         its first-hand tokens. It only applies to wallets without a lock
    ///         recorded at issuance time - a purchase made through the presale
    ///         brings its own sub-phase lock, see {redeemableFrom}.
    uint256 public lockPeriod = 90 days;

    /// @notice Addresses allowed to receive USDT flash loans (arbitrage / market
    ///         maker bots defending the NAV Floor).
    mapping(address => bool) public isWhitelisted;

    /**
     * @notice Emitted when a first-hand wallet redeems its NAVIS tokens.
     * @param user        Wallet that burned its tokens.
     * @param tokenAmount Amount of NAVIS burned (1e18).
     * @param usdtAmount  Amount of USDT paid out (USDT base units).
     * @param navFloor    NAV Floor used to price the redemption (USDT base units).
     */
    event Redeemed(
        address indexed user,
        uint256 tokenAmount,
        uint256 usdtAmount,
        uint256 navFloor
    );

    /**
     * @notice Emitted when a USDT flash loan is issued and fully repaid.
     * @param receiver  Whitelisted contract that received the loan.
     * @param initiator Address that triggered the loan.
     * @param amount    Amount of USDT loaned and returned.
     */
    event FlashLoanIssued(
        address indexed receiver,
        address indexed initiator,
        uint256 amount
    );

    /**
     * @notice Emitted when a wallet burns NAVIS bought below the NAV Floor.
     * @param caller      Wallet that supplied the tokens.
     * @param tokenAmount Amount of NAVIS burned (1e18).
     */
    event TokensBoughtBack(address indexed caller, uint256 tokenAmount);

    /**
     * @notice Emitted when the redemption lock period is updated.
     * @param previousLockPeriod Previous lock period in seconds.
     * @param newLockPeriod      New lock period in seconds.
     */
    event LockPeriodUpdated(uint256 previousLockPeriod, uint256 newLockPeriod);

    /**
     * @notice Emitted when an address is added to or removed from the flash-loan
     *         whitelist.
     * @param account Address whose status changed.
     * @param status  New whitelist status.
     */
    event WhitelistUpdated(address indexed account, bool status);

    /**
     * @param initialOwner Address able to manage the reserve configuration.
     * @param navToken_    Address of the NAVIS token.
     * @param usdt_        Address of the USDT token.
     */
    constructor(
        address initialOwner,
        address navToken_,
        address usdt_
    ) Ownable(initialOwner) {
        require(navToken_ != address(0), "Treasury: NAV token is the zero address");
        require(usdt_ != address(0), "Treasury: USDT is the zero address");

        navToken = INAVToken(navToken_);
        usdt = IERC20(usdt_);
    }

    /* --------------------------------------------------------------------- */
    /*                              VIEW HELPERS                             */
    /* --------------------------------------------------------------------- */

    /// @notice USDT reserve currently held by the treasury (USDT base units).
    function reserveBalance() public view returns (uint256) {
        return usdt.balanceOf(address(this));
    }

    /**
     * @notice Current NAV Floor: the USDT value of a whole NAVIS token expressed
     *         in USDT base units.
     * @dev    NAV_Floor = reserveBalance * 1e18 / NAVIS total supply.
     *         Returns 0 while the total supply is still zero.
     */
    function navFloor() public view returns (uint256) {
        uint256 supply = navToken.totalSupply();
        if (supply == 0) {
            return 0;
        }
        return (reserveBalance() * NAVIS_SCALE) / supply;
    }

    /**
     * @notice Timestamp from which `user` may redeem its first-hand tokens.
     * @dev    The lock recorded at issuance time wins: a purchase through the
     *         presale stored `purchase timestamp + lock period of the sub-phase`
     *         in {INAVToken-redemptionLockExpiresAt}, and that is the timestamp
     *         honoured here - a global {lockPeriod} update can therefore never
     *         shorten (nor lengthen) a lock that was already quoted to a buyer.
     *
     *         Wallets without a recorded lock fall back to the most recent direct
     *         issuance plus {lockPeriod}, so a fresh {INAVToken-mintDirect}
     *         restarts their lock. Returns 0 when the wallet never received tokens
     *         directly.
     */
    function redeemableFrom(address user) public view returns (uint256) {
        uint256 recordedLock = navToken.redemptionLockExpiresAt(user);
        if (recordedLock != 0) {
            return recordedLock;
        }

        uint256 anchor = navToken.lastDirectMintAt(user);
        if (anchor == 0) {
            return 0;
        }
        return anchor + lockPeriod;
    }

    /// @notice Whether the redemption lock of `user` has already elapsed.
    function isLockElapsed(address user) public view returns (bool) {
        uint256 unlockAt = redeemableFrom(user);
        return unlockAt != 0 && block.timestamp >= unlockAt;
    }

    /* --------------------------------------------------------------------- */
    /*                               REDEEM                                  */
    /* --------------------------------------------------------------------- */

    /**
     * @notice Redeem `tokenAmount` first-hand NAVIS for USDT at the current NAV
     *         Floor.
     * @dev    Flow:
     *           1. require the redemption lock of the caller
     *              ({redeemableFrom}) to be over;
     *           2. require the caller to be a first-hand holder of at least
     *              `tokenAmount` (checked against {INAVToken-firstHandEligibility});
     *           3. price the tokens with the *pre-burn* NAV Floor:
     *              `usdtAmount = tokenAmount * navFloor / 1e18`;
     *           4. burn the tokens through {INAVToken-burnDirect}, which also
     *              reduces the first-hand quota by the same amount (verified
     *              on-chain below) and lowers the total supply, so the floor
     *              rises for the remaining holders;
     *           5. pay `usdtAmount` USDT out of the reserve to the caller.
     *
     *         Reverts when the requested tokens exceed the caller's first-hand
     *         eligibility, when the lock period is still active, or when the
     *         reserve cannot cover the payout.
     *
     * @param  tokenAmount Amount of NAVIS to redeem (1e18 base units).
     */
    function redeem(uint256 tokenAmount) external nonReentrant {
        require(tokenAmount > 0, "Treasury: amount must be greater than zero");
        require(isLockElapsed(msg.sender), "Treasury: lock period not elapsed");
        require(
            navToken.balanceOf(msg.sender) >= tokenAmount,
            "Treasury: insufficient NAVIS balance"
        );

        uint256 quotaBefore = navToken.firstHandEligibility(msg.sender);
        require(
            quotaBefore >= tokenAmount,
            "Treasury: exceeds first-hand eligibility"
        );

        // 3. Price the redemption with the floor that is valid before the burn.
        uint256 floor = navFloor();
        require(floor > 0, "Treasury: NAV floor is zero");

        uint256 usdtAmount = (tokenAmount * floor) / NAVIS_SCALE;
        require(usdtAmount > 0, "Treasury: redemption value is zero");
        require(
            reserveBalance() >= usdtAmount,
            "Treasury: insufficient reserve"
        );

        // 4. Burn the redeemed tokens: this reduces the total supply and the
        //    first-hand quota of the caller inside the NAVIS token.
        navToken.burnDirect(msg.sender, tokenAmount);
        uint256 quotaAfter = navToken.firstHandEligibility(msg.sender);
        require(
            quotaAfter <= quotaBefore && quotaBefore - quotaAfter == tokenAmount,
            "Treasury: first-hand quota not reduced"
        );

        // 5. Pay the floor value of the burned tokens from the reserve.
        usdt.safeTransfer(msg.sender, usdtAmount);

        emit Redeemed(msg.sender, tokenAmount, usdtAmount, floor);
    }

    /* --------------------------------------------------------------------- */
    /*                              FLASH LOANS                              */
    /* --------------------------------------------------------------------- */

    /**
     * @notice Lend `amount` USDT to a whitelisted arbitrage contract for the
     *         duration of a single transaction, free of charge.
     * @dev    Flow:
     *           1. require `receiver` to be whitelisted and to be a contract;
     *           2. remember the reserve balance and transfer the loan;
     *           3. call {IFlashLoanReceiver-onFlashLoan} so the receiver can buy
     *              NAVIS below the NAV Floor on the open market and burn it
     *              (which raises the floor for everybody);
     *           4. require the full amount to be back on the treasury balance
     *              before the transaction ends.
     *
     *         Because the whole balance has to be restored, a receiver that
     *         keeps part of the loan (or anything at all) makes the call revert.
     *
     * @param  amount   Amount of USDT to lend (USDT base units).
     * @param  receiver Whitelisted contract implementing the callback.
     * @param  data     Arbitrary payload forwarded to the callback.
     */
    function flashLoanUSDT(
        uint256 amount,
        address receiver,
        bytes calldata data
    ) external nonReentrant {
        require(amount > 0, "Treasury: amount must be greater than zero");
        require(isWhitelisted[receiver], "Treasury: receiver is not whitelisted");
        require(receiver.code.length > 0, "Treasury: receiver is not a contract");

        uint256 balanceBefore = reserveBalance();
        require(balanceBefore >= amount, "Treasury: insufficient reserve");

        usdt.safeTransfer(receiver, amount);
        IFlashLoanReceiver(receiver).onFlashLoan(
            msg.sender,
            address(usdt),
            amount,
            0,
            data
        );

        // Full repayment check: the loan plus whatever was already in the
        // reserve must be available again.
        require(
            reserveBalance() >= balanceBefore,
            "Treasury: flash loan not repaid"
        );

        emit FlashLoanIssued(receiver, msg.sender, amount);
    }

    /* --------------------------------------------------------------------- */
    /*                             BURN BOUGHT BACK                          */
    /* --------------------------------------------------------------------- */

    /**
     * @notice Burn `tokenAmount` NAVIS bought on the open market below the NAV
     *         Floor, pulling them from the caller.
     * @dev    Callable by anybody (holders may burn their own tokens). Burning
     *         lowers the total supply, which lifts the floor for the remaining
     *         holders. The caller must have approved this contract first.
     * @param  tokenAmount Amount of NAVIS to pull and burn (1e18 base units).
     */
    function burnBoughtBack(uint256 tokenAmount) external nonReentrant {
        require(tokenAmount > 0, "Treasury: amount must be greater than zero");

        // Cast to the base interface: `using SafeERC20 for IERC20` is attached
        // to IERC20 itself, not to the derived INAVToken interface.
        IERC20(address(navToken)).safeTransferFrom(
            msg.sender,
            address(this),
            tokenAmount
        );
        navToken.burnDirect(address(this), tokenAmount);

        emit TokensBoughtBack(msg.sender, tokenAmount);
    }

    /* --------------------------------------------------------------------- */
    /*                              ADMINISTRATION                           */
    /* --------------------------------------------------------------------- */

    /**
     * @notice Update the fallback lock period that must elapse after the most
     *         recent direct issuance before a first-hand wallet without a lock
     *         recorded at issuance time can redeem.
     * @dev    Locks recorded for a purchase made through the presale are not
     *         affected: they stay valid for the timestamp that was quoted then.
     * @param newLockPeriod New fallback lock period in seconds.
     */
    function setLockPeriod(uint256 newLockPeriod) external onlyOwner {
        require(newLockPeriod > 0, "Treasury: lock period must be greater than zero");

        uint256 previousLockPeriod = lockPeriod;
        lockPeriod = newLockPeriod;

        emit LockPeriodUpdated(previousLockPeriod, newLockPeriod);
    }

    /**
     * @notice Add an address to, or remove it from, the flash-loan whitelist.
     * @param account Address whose status changes.
     * @param status  True to whitelist, false to revoke.
     */
    function setWhitelisted(address account, bool status) external onlyOwner {
        require(account != address(0), "Treasury: account is the zero address");
        isWhitelisted[account] = status;
        emit WhitelistUpdated(account, status);
    }

    /**
     * @notice Whitelist or de-whitelist several addresses in one transaction.
     * @param accounts Addresses whose status changes.
     * @param status   True to whitelist, false to revoke.
     */
    function setWhitelistedBatch(
        address[] calldata accounts,
        bool status
    ) external onlyOwner {
        uint256 length = accounts.length;
        for (uint256 i = 0; i < length; i++) {
            address account = accounts[i];
            require(account != address(0), "Treasury: account is the zero address");
            isWhitelisted[account] = status;
            emit WhitelistUpdated(account, status);
        }
    }
}
