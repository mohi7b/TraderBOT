// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {ProtocolPausable} from "./ProtocolPausable.sol";

/**
 * @dev Minimal view of the NAVIS token. Besides the standard ERC20 surface, the
 *      presale needs {mintDirectWithLock}, which issues freshly purchased tokens
 *      together with the redemption lock of the sub-phase they were bought in,
 *      and {redemptionLockExpiresAt}, which exposes that lock to callers.
 */
interface INAVToken is IERC20 {
    function mintDirect(address to, uint256 amount) external;

    function mintDirectWithLock(
        address to,
        uint256 amount,
        uint256 lockPeriod
    ) external returns (uint256 expiresAt);

    function redemptionLockExpiresAt(
        address account
    ) external view returns (uint256);
}

/**
 * @title  Presale
 * @author NAV Ecosystem
 * @notice Multi sub-phase presale for the NAVIS token settled in USDT.
 *
 *         Pricing is anchored to the on-chain "NAV Floor", i.e. the value of the
 *         USDT reserve held by the treasury divided by the NAVIS total supply:
 *
 *             NAV_Floor         = treasuryReserve / navisTotalSupply
 *             Phase token price = NAV_Floor * priceMultiplier / 1e6
 *
 *         Every purchase is settled in USDT and split in two parts:
 *           - the floor value of the tokens (NAV_Floor * tokenAmount) is sent to
 *             the treasury vault, so the reserve keeps backing the new supply;
 *           - the remaining USDT (the premium above the floor) is routed to the
 *             liquidity pool.
 *
 *         The token itself is issued through {INAVToken-mintDirectWithLock},
 *         therefore this contract must be the owner of the NAVIS token.
 *
 *         Every sub-phase also carries its own redemption lock period
 *         ({DEFAULT_LOCK_PERIOD}, i.e. 180 days, unless configured otherwise).
 *         A purchase records `block.timestamp + lockPeriod` of the sub-phase it
 *         was bought in as the redemption lock of the buyer, and a purchase that
 *         overflows into several sub-phases keeps the longest lock of the
 *         sub-phases involved. The record lives in the NAVIS token and is what
 *         the treasury checks before paying out a redemption.
 *
 *         The presale is pausable ({ProtocolPausable}): while it is paused no
 *         purchase can be settled, while every administrative entry point and
 *         the treasury keep working. Sales resume exactly where they stopped -
 *         the sub-phase pointer and the sold counters are untouched.
 *
 * @dev    Amount conventions:
 *           - USDT amounts are expressed in the token's own base units (6 for
 *             the real USDT);
 *           - NAVIS amounts are expressed in 1e18 base units (18 decimals).
 *         The formulas below are decimal-agnostic for USDT because the NAV
 *         floor is already expressed in USDT base units.
 */
contract Presale is ProtocolPausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Denominator used for {SubPhase-priceMultiplier} (1.000000 == 1e6).
    uint256 public constant MULTIPLIER_DENOMINATOR = 1e6;

    /// @notice Fixed scale of a whole NAVIS token (18 decimals).
    uint256 public constant NAVIS_SCALE = 1e18;

    /// @notice Redemption lock a sub-phase is created with when no explicit lock
    ///         period is configured: 180 days.
    uint256 public constant DEFAULT_LOCK_PERIOD = 180 days;

    /// @notice NAVIS token that is sold by this presale (must be owned by it).
    INAVToken public immutable navToken;

    /// @notice Settlement token (USDT).
    IERC20 public immutable usdt;

    /// @notice Address that receives the floor value of every purchase.
    address public treasuryVault;

    /// @notice Address that receives the premium (price above the floor).
    address public liquidityPool;

    /**
     * @notice A single sub-phase of the presale.
     * @param tokenSupply     Maximum amount of tokens sellable in this sub-phase (1e18).
     * @param tokensSold      Amount of tokens already sold in this sub-phase (1e18).
     * @param priceMultiplier Price multiplier over the NAV Floor, scaled by 1e6
     *                        (e.g. 1_111_111 == 1.111111x the floor).
     * @param active          Whether the sub-phase can currently be sold.
     * @param lockPeriod      Exclusive redemption lock of the sub-phase, in
     *                        seconds. Every purchase of this sub-phase records
     *                        `block.timestamp + lockPeriod` as the redemption
     *                        lock of the buyer. It defaults to
     *                        {DEFAULT_LOCK_PERIOD} (180 days) and can only be
     *                        edited while the sub-phase is still selling (see
     *                        {setSubPhaseLockPeriod}).
     */
    struct SubPhase {
        uint256 tokenSupply;
        uint256 tokensSold;
        uint256 priceMultiplier;
        bool active;
        uint256 lockPeriod;
    }

    /// @notice All configured sub-phases, in sale order.
    SubPhase[] public subPhases;

    /// @notice Index of the sub-phase the next purchase will start from.
    uint256 public currentSubPhase;

    /// @notice Emitted when a new sub-phase is appended.
    event SubPhaseAdded(
        uint256 indexed index,
        uint256 tokenSupply,
        uint256 priceMultiplier,
        bool active
    );

    /// @notice Emitted when an existing sub-phase is reconfigured.
    event SubPhaseUpdated(
        uint256 indexed index,
        uint256 tokenSupply,
        uint256 priceMultiplier,
        bool active
    );

    /**
     * @notice Emitted when the exclusive redemption lock of a sub-phase changes,
     *         either at creation with a non-default lock period or through
     *         {setSubPhaseLockPeriod}.
     * @param index              Sub-phase whose lock was configured.
     * @param previousLockPeriod Lock that was in force before (seconds).
     * @param newLockPeriod      Lock that is in force afterwards (seconds).
     */
    event SubPhaseLockPeriodUpdated(
        uint256 indexed index,
        uint256 previousLockPeriod,
        uint256 newLockPeriod
    );

    /// @notice Emitted when the active sub-phase pointer is moved by the owner.
    event CurrentSubPhaseChanged(uint256 indexed index);

    /// @notice Emitted when the treasury vault address changes.
    event TreasuryVaultUpdated(address indexed previousVault, address indexed newVault);

    /// @notice Emitted when the liquidity pool address changes.
    event LiquidityPoolUpdated(address indexed previousPool, address indexed newPool);

    /**
     * @notice Emitted on every successful purchase.
     * @param buyer        Address that paid USDT and received NAVIS.
     * @param usdtPaid     Amount of USDT spent (base units).
     * @param tokensMinted Amount of NAVIS issued to the buyer (1e18).
     * @param toTreasury   USDT forwarded to the treasury vault (floor value).
     * @param toLiquidity  USDT forwarded to the liquidity pool (premium).
     * @dev   The redemption lock recorded for the buyer is
     *        `block.timestamp + lockPeriod` of the sub-phases that absorbed the
     *        budget (the longest one), see {SubPhase-lockPeriod}.
     */
    event TokensPurchased(
        address indexed buyer,
        uint256 usdtPaid,
        uint256 tokensMinted,
        uint256 toTreasury,
        uint256 toLiquidity
    );

    /**
     * @param initialOwner   Address able to manage sub-phases and destinations.
     * @param navToken_      Address of the NAVIS token (owned by this contract).
     * @param usdt_          Address of the USDT token used for settlement.
     * @param treasuryVault_ Address that receives the floor value of purchases.
     * @param liquidityPool_ Address that receives the premium of purchases.
     */
    constructor(
        address initialOwner,
        address navToken_,
        address usdt_,
        address treasuryVault_,
        address liquidityPool_
    ) Ownable(initialOwner) {
        require(navToken_ != address(0), "Presale: NAV token is the zero address");
        require(usdt_ != address(0), "Presale: USDT is the zero address");
        require(treasuryVault_ != address(0), "Presale: treasury is the zero address");
        require(liquidityPool_ != address(0), "Presale: liquidity pool is the zero address");

        navToken = INAVToken(navToken_);
        usdt = IERC20(usdt_);
        treasuryVault = treasuryVault_;
        liquidityPool = liquidityPool_;
    }

    /* --------------------------------------------------------------------- */
    /*                              VIEW HELPERS                             */
    /* --------------------------------------------------------------------- */

    /**
     * @notice Current NAV Floor, i.e. the USDT value of a whole NAVIS token
     *         expressed in USDT base units.
     * @dev    NAV_Floor = (USDT balance of the treasury) * 1e18 / NAVIS total supply.
     *         Returns 0 while the total supply is still zero.
     */
    function currentNavFloor() public view returns (uint256) {
        uint256 supply = navToken.totalSupply();
        if (supply == 0) {
            return 0;
        }
        return (usdt.balanceOf(treasuryVault) * NAVIS_SCALE) / supply;
    }

    /**
     * @notice Price of a whole NAVIS token in the sub-phase at `index`,
     *         expressed in USDT base units.
     */
    function phasePrice(uint256 index) public view returns (uint256) {
        require(index < subPhases.length, "Presale: invalid sub-phase index");
        uint256 floor = currentNavFloor();
        if (floor == 0) {
            return 0;
        }
        return (floor * subPhases[index].priceMultiplier) / MULTIPLIER_DENOMINATOR;
    }

    /// @notice Number of configured sub-phases.
    function subPhaseCount() external view returns (uint256) {
        return subPhases.length;
    }

    /**
     * @notice Redemption lock currently recorded for `user`: the timestamp from
     *         which the treasury accepts a redemption of its first-hand tokens.
     * @dev    Mirrors {INAVToken-redemptionLockExpiresAt}, which {buyTokens}
     *         fills with `purchase timestamp + lock period of the sub-phase`
     *         (the longest one when a purchase spans several sub-phases). Returns
     *         0 for a wallet that never bought here.
     */
    function userLockExpiresAt(address user) external view returns (uint256) {
        return navToken.redemptionLockExpiresAt(user);
    }

    /* --------------------------------------------------------------------- */
    /*                                 BUY                                   */
    /* --------------------------------------------------------------------- */

    /**
     * @notice Buy NAVIS tokens paying `usdtAmount` USDT.
     * @dev    Flow:
     *           1. pull `usdtAmount` USDT from the caller;
     *           2. read the current NAV Floor;
     *           3. walk the sub-phases starting at {currentSubPhase} and, for
     *              each of them, mint as many tokens as the budget buys at that
     *              sub-phase price; a full sub-phase automatically hands the
     *              remaining budget over to the next one, while the longest
     *              {SubPhase-lockPeriod} of the sub-phases involved is kept in
     *              mind;
     *           4. forward the floor value of the minted tokens to the treasury
     *              and the premium to the liquidity pool;
     *           5. issue the tokens through {INAVToken-mintDirectWithLock},
     *              recording `block.timestamp + longest lock period` as the
     *              redemption lock of the buyer, which is the timestamp the
     *              treasury checks before paying out a redemption.
     *
     *         Reverts when the requested amount cannot be fully allocated across
     *         the configured sub-phases.
     *
     * @param  usdtAmount   Amount of USDT to spend (base units).
     * @return tokensMinted Amount of NAVIS issued to the caller.
     */
    function buyTokens(uint256 usdtAmount)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 tokensMinted)
    {
        require(usdtAmount > 0, "Presale: amount must be greater than zero");

        uint256 navFloor = currentNavFloor();
        require(navFloor > 0, "Presale: NAV floor is zero");

        // 1. Take the USDT from the buyer.
        usdt.safeTransferFrom(msg.sender, address(this), usdtAmount);

        // 3. Allocate the budget across the sub-phases.
        uint256 budget = usdtAmount;
        uint256 toTreasury;
        uint256 longestLockPeriod;
        uint256 i = currentSubPhase;
        uint256 length = subPhases.length;

        while (budget > 0 && i < length) {
            SubPhase storage subPhase = subPhases[i];

            if (!subPhase.active || subPhase.tokensSold >= subPhase.tokenSupply) {
                i++;
                continue;
            }

            uint256 remainingCap = subPhase.tokenSupply - subPhase.tokensSold;
            uint256 price = (navFloor * subPhase.priceMultiplier) /
                MULTIPLIER_DENOMINATOR;
            uint256 affordable = (budget * NAVIS_SCALE) / price;

            if (affordable == 0) {
                // The remaining budget cannot even buy one token unit.
                break;
            }

            uint256 tokensToBuy;
            if (affordable <= remainingCap) {
                // The current sub-phase absorbs the whole remaining budget.
                tokensToBuy = affordable;
                budget = 0;
            } else {
                // The sub-phase is capped: fill it completely and carry the
                // remaining budget over to the next sub-phase.
                tokensToBuy = remainingCap;
                budget -= (tokensToBuy * price) / NAVIS_SCALE;
                i++;
            }

            tokensMinted += tokensToBuy;
            subPhase.tokensSold += tokensToBuy;
            toTreasury += (navFloor * tokensToBuy) / NAVIS_SCALE;

            // 3b. The redemption lock of the purchase is the longest lock of the
            //     sub-phases this budget was actually allocated to.
            if (subPhase.lockPeriod > longestLockPeriod) {
                longestLockPeriod = subPhase.lockPeriod;
            }
        }

        require(
            tokensMinted > 0 && budget == 0,
            "Presale: insufficient supply"
        );

        currentSubPhase = i;

        // 4. Split the settlement: floor value -> treasury, premium -> pool.
        uint256 toLiquidity = usdtAmount - toTreasury;
        if (toTreasury > 0) {
            usdt.safeTransfer(treasuryVault, toTreasury);
        }
        if (toLiquidity > 0) {
            usdt.safeTransfer(liquidityPool, toLiquidity);
        }

        // 5. Issue the purchased tokens to the buyer and record the redemption
        //    lock the purchase is subject to.
        navToken.mintDirectWithLock(msg.sender, tokensMinted, longestLockPeriod);

        emit TokensPurchased(
            msg.sender,
            usdtAmount,
            tokensMinted,
            toTreasury,
            toLiquidity
        );
    }

    /* --------------------------------------------------------------------- */
    /*                              ADMINISTRATION                           */
    /* --------------------------------------------------------------------- */

    /**
     * @notice Append a new sub-phase at the end of the sale order, using the
     *         default redemption lock ({DEFAULT_LOCK_PERIOD}, i.e. 180 days).
     * @param tokenSupply     Cap of sellable tokens in this sub-phase (1e18).
     * @param priceMultiplier Price multiplier over the NAV Floor (1e6 scale).
     * @param active          Whether the sub-phase starts enabled.
     */
    function addSubPhase(
        uint256 tokenSupply,
        uint256 priceMultiplier,
        bool active
    ) external onlyOwner {
        _addSubPhase(tokenSupply, priceMultiplier, active, DEFAULT_LOCK_PERIOD);
    }

    /**
     * @notice Append a new sub-phase with an explicit redemption lock period.
     * @dev    Convenience wrapper of {_addSubPhase} for a launch that wants a
     *         sub-phase lock other than {DEFAULT_LOCK_PERIOD}. The lock can also
     *         be changed later, while the sub-phase is still selling, through
     *         {setSubPhaseLockPeriod}.
     * @param tokenSupply     Cap of sellable tokens in this sub-phase (1e18).
     * @param priceMultiplier Price multiplier over the NAV Floor (1e6 scale).
     * @param active          Whether the sub-phase starts enabled.
     * @param lockPeriod      Exclusive redemption lock of the sub-phase (seconds).
     */
    function addSubPhaseWithLock(
        uint256 tokenSupply,
        uint256 priceMultiplier,
        bool active,
        uint256 lockPeriod
    ) external onlyOwner {
        _addSubPhase(tokenSupply, priceMultiplier, active, lockPeriod);
    }

    /**
     * @dev Shared body of {addSubPhase} and {addSubPhaseWithLock}.
     */
    function _addSubPhase(
        uint256 tokenSupply,
        uint256 priceMultiplier,
        bool active,
        uint256 lockPeriod
    ) private {
        require(
            priceMultiplier >= MULTIPLIER_DENOMINATOR,
            "Presale: multiplier below 1.0"
        );
        require(tokenSupply > 0, "Presale: empty sub-phase");
        require(
            lockPeriod > 0,
            "Presale: lock period must be greater than zero"
        );

        subPhases.push(
            SubPhase({
                tokenSupply: tokenSupply,
                tokensSold: 0,
                priceMultiplier: priceMultiplier,
                active: active,
                lockPeriod: lockPeriod
            })
        );

        uint256 index = subPhases.length - 1;
        emit SubPhaseAdded(index, tokenSupply, priceMultiplier, active);

        // A sub-phase is born with the default lock; anything else is reported as
        // an explicit lock update so that indexers see both steps.
        if (lockPeriod != DEFAULT_LOCK_PERIOD) {
            emit SubPhaseLockPeriodUpdated(
                index,
                DEFAULT_LOCK_PERIOD,
                lockPeriod
            );
        }
    }

    /**
     * @notice Reconfigure an existing sub-phase.
     * @dev    `tokenSupply` can never be lowered below the amount already sold.
     */
    function setSubPhase(
        uint256 index,
        uint256 tokenSupply,
        uint256 priceMultiplier,
        bool active
    ) external onlyOwner {
        require(index < subPhases.length, "Presale: invalid sub-phase index");
        require(
            priceMultiplier >= MULTIPLIER_DENOMINATOR,
            "Presale: multiplier below 1.0"
        );

        SubPhase storage subPhase = subPhases[index];
        require(
            tokenSupply >= subPhase.tokensSold,
            "Presale: supply below tokens sold"
        );

        subPhase.tokenSupply = tokenSupply;
        subPhase.priceMultiplier = priceMultiplier;
        subPhase.active = active;

        emit SubPhaseUpdated(index, tokenSupply, priceMultiplier, active);
    }

    /**
     * @notice Update the exclusive redemption lock of a sub-phase.
     * @dev    Only allowed while the sub-phase is still on sale: the pointer of
     *         {currentSubPhase} must not have moved past it and it must still
     *         have unsold tokens. Once a sub-phase is sold out its lock is frozen,
     *         so the lock a buyer was quoted can never be changed after the fact.
     *         Purchases that were already settled keep the lock that was recorded
     *         for them; the update only applies to later purchases.
     * @param index         Sub-phase to reconfigure.
     * @param newLockPeriod New redemption lock in seconds.
     */
    function setSubPhaseLockPeriod(
        uint256 index,
        uint256 newLockPeriod
    ) external onlyOwner {
        require(index < subPhases.length, "Presale: invalid sub-phase index");
        require(
            newLockPeriod > 0,
            "Presale: lock period must be greater than zero"
        );
        require(
            index >= currentSubPhase,
            "Presale: sub-phase already closed"
        );

        SubPhase storage subPhase = subPhases[index];
        require(
            subPhase.tokensSold < subPhase.tokenSupply,
            "Presale: sub-phase is sold out"
        );

        uint256 previousLockPeriod = subPhase.lockPeriod;
        subPhase.lockPeriod = newLockPeriod;

        emit SubPhaseLockPeriodUpdated(index, previousLockPeriod, newLockPeriod);
    }

    /**
     * @notice Move the pointer of the sub-phase the next purchase starts from.
     * @param index New sub-phase index (may equal {subPhaseCount} to mark the
     *              presale as exhausted).
     */
    function setCurrentSubPhase(uint256 index) external onlyOwner {
        require(index <= subPhases.length, "Presale: invalid sub-phase index");
        currentSubPhase = index;
        emit CurrentSubPhaseChanged(index);
    }

    /// @notice Update the address receiving the floor value of purchases.
    function setTreasuryVault(address newTreasuryVault) external onlyOwner {
        require(newTreasuryVault != address(0), "Presale: treasury is the zero address");
        emit TreasuryVaultUpdated(treasuryVault, newTreasuryVault);
        treasuryVault = newTreasuryVault;
    }

    /// @notice Update the address receiving the premium of purchases.
    function setLiquidityPool(address newLiquidityPool) external onlyOwner {
        require(newLiquidityPool != address(0), "Presale: liquidity pool is the zero address");
        emit LiquidityPoolUpdated(liquidityPool, newLiquidityPool);
        liquidityPool = newLiquidityPool;
    }
}
