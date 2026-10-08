// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @dev Minimal DEX surface used by the market maker: swap a known amount of one
 *      token for another along a fixed path, quote that swap for free and manage
 *      concentrated-liquidity positions.
 *
 *      The signature of {swapExactTokensForTokens} is the one every V2 style
 *      router (PancakeSwap V2, Uniswap V2) exposes, so a real router can be
 *      plugged in without touching this contract; {contracts/mocks/MockDEXRouter.sol}
 *      provides a compatible implementation for the test-suite.
 */
interface IDEXRouter {
    /**
     * @param amountIn     Exact amount of `path[0]` to sell.
     * @param amountOutMin Minimum amount of `path[last]` to accept.
     * @param path         Sell path; this contract always uses [USDT, NAVIS].
     * @param to           Recipient of the output tokens.
     * @param deadline     Unix timestamp after which the swap reverts.
     */
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);

    /// @notice Free quote of {swapExactTokensForTokens}.
    function getAmountsOut(
        uint256 amountIn,
        address[] calldata path
    ) external view returns (uint256[] memory amounts);

    /**
     * @notice Provide concentrated liquidity in `[tickLower, tickUpper)`.
     * @return positionId Opaque identifier of the created position.
     * @return liquidity  Liquidity units minted.
     */
    function mintPosition(
        address tokenA,
        address tokenB,
        int24 tickLower,
        int24 tickUpper,
        uint256 amountADesired,
        uint256 amountBDesired,
        address to
    ) external returns (uint256 positionId, uint128 liquidity);

    /// @notice Withdraw a position and send both tokens to `to`.
    function removePosition(
        uint256 positionId,
        address to
    ) external returns (uint256 amountA, uint256 amountB);
}

/**
 * @dev Subset of the treasury surface the market maker relies on.
 */
interface ITreasury {
    /// @notice Zero-fee USDT flash loan paid back inside the same transaction.
    function flashLoanUSDT(
        uint256 amount,
        address receiver,
        bytes calldata data
    ) external;

    /// @notice Burn NAVIS pulled from the caller, lifting the NAV Floor.
    function burnBoughtBack(uint256 tokenAmount) external;

    /**
     * @notice USDT value of a whole NAVIS token, in USDT base units:
     *         `reserveBalance * 1e18 / NAVIS total supply`.
     */
    function navFloor() external view returns (uint256);
}

/**
 * @dev Callback a whitelisted flash-loan receiver must implement, mirroring the
 *      interface declared by {Treasury}.
 */
interface IFlashLoanReceiver {
    function onFlashLoan(
        address initiator,
        address token,
        uint256 amount,
        uint256 fee,
        bytes calldata data
    ) external;
}

/**
 * @title  MarketMaker
 * @author NAV Ecosystem
 * @notice On-chain market maker of the NAVIS protocol. It runs the two
 *         strategies that keep the market price of NAVIS anchored to the NAV
 *         Floor published by the {Treasury}:
 *
 *           1. floor arbitrage - when NAVIS trades *below* the floor, it
 *              borrows USDT from the treasury with a zero-fee flash loan, buys
 *              NAVIS on the DEX and burns the bought tokens through
 *              {Treasury-burnBoughtBack}. The supply shrinks while the reserve
 *              stays untouched, so the floor of every remaining holder rises;
 *
 *           2. liquidity rebalancing - it quotes the NAV Floor into the tick
 *              space of a concentrated-liquidity pool and mints a position
 *              around that tick, so that new liquidity is always placed where
 *              the floor currently is.
 *
 * @dev    Roles:
 *           - `owner`  - governance: keepers, treasury, router, band width,
 *                        USDT float withdrawals;
 *           - `keeper` - addresses allowed to run the two strategies above
 *                        (arbitrage robots / trading desks).
 *
 *         Amount conventions (identical to {Treasury}):
 *           - USDT amounts are expressed in the token's own base units (6);
 *           - NAVIS amounts are expressed in 1e18 base units (18 decimals).
 *
 *         Repayment of the flash loan: the whole loan is spent on the buyback,
 *         so the principal is returned to the reserve out of the *USDT float*
 *         the market maker keeps for exactly this purpose. The float is the
 *         arbitrage budget of the desk and is topped up with {depositUSDT}; an
 *         arbitrage therefore reverts with "USDT float cannot repay the flash
 *         loan" whenever the float is smaller than the loan.
 *
 *         Tick space: the pool is assumed to be a NAVIS/USDT concentrated
 *         liquidity pool. Since the NAV Floor is quoted in USDT base units per
 *         whole NAVIS, the tick it corresponds to is
 *
 *             tick = log2(floor / 1e18) / log2(1.0001)
 *                  = (log2(floor) - 18 * log2(10)) / log2(1.0001)
 *
 *         which is computed on-chain by {tickAtFloor} with a 64-bit fixed-point
 *         binary logarithm.
 */
contract MarketMaker is IFlashLoanReceiver, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Fixed scale of a whole NAVIS token (18 decimals).
    uint256 public constant NAVIS_SCALE = 1e18;

    /// @dev 1.0 in Wad, used for the tick arithmetic.
    uint256 private constant WAD = 1e18;

    /// @dev Smallest tick a Uniswap V3 style pool accepts.
    int24 public constant MIN_TICK = -887272;

    /// @dev Largest tick a Uniswap V3 style pool accepts.
    int24 public constant MAX_TICK = 887272;

    /// @notice Default half width of the liquidity band: 600 ticks, i.e. a
    ///         price band of 1.0001^600 = 1.0618, roughly +-6.2% around the
    ///         floor tick.
    uint256 public constant DEFAULT_RANGE_WIDTH_TICKS = 600;

    /// @notice Largest accepted half width of the liquidity band.
    uint256 public constant MAX_RANGE_WIDTH_TICKS = 887272;

    /// @dev log2(10) in Wad: 3.321928094887362347 * 1e18.
    uint256 private constant LOG2_10_WAD = 3321928094887362348;

    /// @dev Ticks per unit of log2(price), i.e. 1 / log2(1.0001):
    ///      6931.818373414559 * 1e18.
    uint256 private constant TICKS_PER_LOG2_WAD = 6931818373414559000000;

    /* --------------------------------------------------------------------- */
    /*                                 STATE                                 */
    /* --------------------------------------------------------------------- */

    /// @notice NAVIS token traded by the market maker (18 decimals).
    IERC20 public immutable navToken;

    /// @notice Reserve token (USDT, 6 decimals).
    IERC20 public immutable usdt;

    /// @notice Treasury that backs the NAV Floor and issues the flash loans.
    ITreasury public treasury;

    /// @notice Router / pool the market maker trades and provides liquidity on.
    IDEXRouter public router;

    /// @notice Addresses allowed to run the arbitrage and liquidity strategies.
    mapping(address => bool) public isKeeper;

    /// @notice Half width, in ticks, of the liquidity band used when a caller
    ///         does not pass an explicit width to {rebalanceLiquidity}.
    uint256 public rangeWidthTicks = DEFAULT_RANGE_WIDTH_TICKS;

    /// @notice Lower tick of the band derived from the NAV Floor most recently.
    int24 public rangeTickLower;

    /// @notice Upper tick of the band derived from the NAV Floor most recently.
    int24 public rangeTickUpper;

    /// @notice Total NAVIS burned through {Treasury-burnBoughtBack} so far.
    uint256 public totalTokensBurned;

    /// @notice Total USDT spent on buybacks so far (all of it flashed).
    uint256 public totalUsdtSpentOnBuybacks;

    /// @notice Number of arbitrage rounds completed.
    uint256 public arbitrageCount;

    /// @notice Timestamp of the most recent arbitrage round.
    uint256 public lastArbitrageAt;

    /// @notice NAVIS burned in the most recent arbitrage round.
    uint256 public lastTokensBurned;

    /// @notice USDT flashed in the most recent arbitrage round.
    uint256 public lastUsdtSpent;

    /// @notice Identifier of the most recently minted liquidity position.
    uint256 public lastPositionId;

    /// @dev True while {executeBelowFloorArbitrage} is waiting for its flash loan.
    bool private _arbitrageActive;

    /// @dev NAVIS bought by the callback of the flash loan in flight.
    uint256 private _pendingTokensBought;

    /// @dev NAV Floor observed right before the buyback in flight.
    uint256 private _pendingFloorBefore;

    /* --------------------------------------------------------------------- */
    /*                                EVENTS                                 */
    /* --------------------------------------------------------------------- */

    /**
     * @notice Emitted when a keeper status changes.
     * @param keeper Address whose status changed.
     * @param status New status.
     */
    event KeeperUpdated(address indexed keeper, bool status);

    /**
     * @notice Emitted when the treasury address is updated.
     * @param previousTreasury Previous treasury.
     * @param newTreasury      New treasury.
     */
    event TreasuryUpdated(
        address indexed previousTreasury,
        address indexed newTreasury
    );

    /**
     * @notice Emitted when the DEX router address is updated.
     * @param previousRouter Previous router.
     * @param newRouter      New router.
     */
    event RouterUpdated(
        address indexed previousRouter,
        address indexed newRouter
    );

    /**
     * @notice Emitted when the default liquidity band width is updated.
     * @param previousWidth Previous half width in ticks.
     * @param newWidth      New half width in ticks.
     */
    event RangeWidthUpdated(uint256 previousWidth, uint256 newWidth);

    /**
     * @notice Emitted whenever the liquidity band is recomputed from the floor.
     * @param tickLower Lower tick of the band.
     * @param tickUpper Upper tick of the band.
     * @param navFloor  NAV Floor the band was derived from (USDT base units).
     */
    event LiquidityRangeUpdated(
        int24 tickLower,
        int24 tickUpper,
        uint256 navFloor
    );

    /**
     * @notice Emitted for every completed arbitrage round, once the bought tokens
     *         have been burned, so that both floors are part of the record.
     * @param keeper       Keeper that triggered the round.
     * @param usdtSpent    USDT borrowed and spent on the buyback.
     * @param tokensBought NAVIS bought on the DEX.
     * @param floorBefore  NAV Floor before the burn (USDT base units).
     * @param floorAfter   NAV Floor after the burn (USDT base units).
     */
    event ArbitrageExecuted(
        address indexed keeper,
        uint256 usdtSpent,
        uint256 tokensBought,
        uint256 floorBefore,
        uint256 floorAfter
    );

    /**
     * @notice Emitted when a concentrated-liquidity position is minted.
     * @param positionId     Identifier returned by the router.
     * @param tickLower      Lower tick of the band.
     * @param tickUpper      Upper tick of the band.
     * @param usdtDeposited  USDT contributed by the market maker in total.
     * @param navisDeposited NAVIS contributed to the position.
     * @param usdtPaired     USDT contributed to the position (not swapped).
     * @param liquidity      Liquidity units minted.
     */
    event LiquidityRebalanced(
        uint256 indexed positionId,
        int24 tickLower,
        int24 tickUpper,
        uint256 usdtDeposited,
        uint256 navisDeposited,
        uint256 usdtPaired,
        uint128 liquidity
    );

    /**
     * @notice Emitted when a liquidity position is withdrawn.
     * @param positionId Identifier of the withdrawn position.
     * @param to         Recipient of the tokens.
     * @param navisOut   NAVIS returned by the router.
     * @param usdtOut    USDT returned by the router.
     */
    event LiquidityRemoved(
        uint256 indexed positionId,
        address indexed to,
        uint256 navisOut,
        uint256 usdtOut
    );

    /**
     * @notice Emitted when USDT is added to the arbitrage float.
     * @param from   Address that funded the float.
     * @param amount Amount of USDT added.
     */
    event UsdtDeposited(address indexed from, uint256 amount);

    /**
     * @notice Emitted when USDT is withdrawn from the arbitrage float.
     * @param to     Recipient of the USDT.
     * @param amount Amount of USDT withdrawn.
     */
    event UsdtWithdrawn(address indexed to, uint256 amount);

    /**
     * @param initialOwner Address able to manage the market maker.
     * @param navToken_    Address of the NAVIS token.
     * @param usdt_        Address of the USDT token.
     * @param treasury_    Address of the treasury.
     * @param router_      Address of the DEX router.
     */
    constructor(
        address initialOwner,
        address navToken_,
        address usdt_,
        address treasury_,
        address router_
    ) Ownable(initialOwner) {
        require(
            navToken_ != address(0),
            "MarketMaker: NAV token is the zero address"
        );
        require(usdt_ != address(0), "MarketMaker: USDT is the zero address");
        require(
            treasury_ != address(0),
            "MarketMaker: treasury is the zero address"
        );
        require(router_ != address(0), "MarketMaker: router is the zero address");

        navToken = IERC20(navToken_);
        usdt = IERC20(usdt_);
        treasury = ITreasury(treasury_);
        router = IDEXRouter(router_);
    }

    /// @notice Reverts unless the caller is a registered keeper.
    modifier onlyKeeper() {
        require(isKeeper[msg.sender], "MarketMaker: caller is not a keeper");
        _;
    }

    /* --------------------------------------------------------------------- */
    /*                           VIEW FUNCTIONS                              */
    /* --------------------------------------------------------------------- */

    /// @notice USDT float currently available to repay flash loans.
    function floatBalance() external view returns (uint256) {
        return usdt.balanceOf(address(this));
    }

    /**
     * @notice NAVIS the DEX would return for `usdtAmount` USDT, right now.
     * @param usdtAmount Amount of USDT to sell (USDT base units).
     * @return tokensOut Amount of NAVIS bought (1e18 base units).
     */
    function buyQuote(
        uint256 usdtAmount
    ) external view returns (uint256 tokensOut) {
        return router.getAmountsOut(usdtAmount, _usdtToNavisPath())[1];
    }

    /**
     * @notice Tick of the pooled NAVIS/USDT price that corresponds to the
     *         current NAV Floor.
     * @dev    `tick = log2(floor / 1e18) / log2(1.0001)`, clamped to the tick
     *         range a Uniswap V3 style pool accepts.
     */
    function tickAtFloor() public view returns (int24) {
        return _tickAtFloor(treasury.navFloor());
    }

    /**
     * @notice Liquidity band derived from the current NAV Floor.
     * @param widthTicks Half width of the band, in ticks.
     * @return tickLower Lower tick of the band.
     * @return tickUpper Upper tick of the band.
     */
    function rangeFromFloor(
        uint256 widthTicks
    ) public view returns (int24 tickLower, int24 tickUpper) {
        return _rangeFromFloor(_tickAtFloor(treasury.navFloor()), widthTicks);
    }

    /// @notice Band that was derived from the NAV Floor most recently.
    function liquidityRange()
        external
        view
        returns (int24 tickLower, int24 tickUpper)
    {
        return (rangeTickLower, rangeTickUpper);
    }

    /* --------------------------------------------------------------------- */
    /*                            TICK ARITHMETIC                            */
    /* --------------------------------------------------------------------- */

    /**
     * @dev Converts a NAV Floor into the tick of the NAVIS/USDT pool.
     *
     *      One whole NAVIS is `1e18` base units and is worth `floor` USDT base
     *      units, so the raw pool price (USDT base units per NAVIS base unit)
     *      is `floor / 1e18`. Taking the binary logarithm:
     *
     *          log2(rawPrice) = log2(floor) - 18 * log2(10)
     *
     *      and since one tick is a price step of 1.0001:
     *
     *          tick = log2(rawPrice) / log2(1.0001)
     */
    function _tickAtFloor(uint256 floor) internal pure returns (int24) {
        require(floor > 0, "MarketMaker: NAV floor is zero");

        int256 log2PriceWad = _log2Wad(floor) - int256(18 * LOG2_10_WAD);
        int256 tick = (log2PriceWad * int256(TICKS_PER_LOG2_WAD)) /
            int256(WAD * WAD);

        if (tick < int256(MIN_TICK)) {
            return MIN_TICK;
        }
        if (tick > int256(MAX_TICK)) {
            return MAX_TICK;
        }

        return int24(tick);
    }

    /**
     * @dev Builds the symmetric band `[center - width, center + width]` and
     *      checks that it stays inside the tick range of the pool.
     */
    function _rangeFromFloor(
        int24 center,
        uint256 widthTicks
    ) internal pure returns (int24 tickLower, int24 tickUpper) {
        require(
            widthTicks > 0,
            "MarketMaker: range width must be greater than zero"
        );
        require(
            widthTicks <= MAX_RANGE_WIDTH_TICKS,
            "MarketMaker: range width too large"
        );

        int256 lower = int256(center) - int256(widthTicks);
        int256 upper = int256(center) + int256(widthTicks);
        require(
            lower >= int256(MIN_TICK) && upper <= int256(MAX_TICK),
            "MarketMaker: liquidity range is out of bounds"
        );

        return (int24(lower), int24(upper));
    }

    /// @dev Path used for every buy: USDT in, NAVIS out.
    function _usdtToNavisPath() internal view returns (address[] memory path) {
        path = new address[](2);
        path[0] = address(usdt);
        path[1] = address(navToken);
    }

    /**
     * @dev floor(log2(x)) in Wad, for `1 <= x < 2**192`.
     *
     *      The integer part is the index of the most significant bit; the 64
     *      fractional bits come from the classic binary-logarithm loop that
     *      repeatedly squares the mantissa and keeps the bits that push it past
     *      2, which is what makes the loop converge to log2.
     */
    function _log2Wad(uint256 x) internal pure returns (int256) {
        require(x > 0, "MarketMaker: logarithm of zero");
        require(
            x < (uint256(1) << 192),
            "MarketMaker: logarithm input too large"
        );

        uint256 exponent = _msb(x);
        uint256 mantissa = (x << 64) >> exponent; // Q64.64 value in [1, 2)
        uint256 fraction;

        for (uint256 i = 0; i < 64; i++) {
            mantissa = (mantissa * mantissa) >> 64;
            if (mantissa >= (uint256(1) << 65)) {
                mantissa >>= 1;
                fraction |= uint256(1) << (63 - i);
            }
        }

        uint256 log2Q64 = (exponent << 64) + fraction;

        return int256((log2Q64 * WAD) >> 64);
    }

    /// @dev Index of the most significant bit of `x`, i.e. floor(log2(x)).
    function _msb(uint256 x) internal pure returns (uint256 msb) {
        if (x >= (uint256(1) << 128)) {
            x >>= 128;
            msb += 128;
        }
        if (x >= (uint256(1) << 64)) {
            x >>= 64;
            msb += 64;
        }
        if (x >= (uint256(1) << 32)) {
            x >>= 32;
            msb += 32;
        }
        if (x >= (uint256(1) << 16)) {
            x >>= 16;
            msb += 16;
        }
        if (x >= (uint256(1) << 8)) {
            x >>= 8;
            msb += 8;
        }
        if (x >= (uint256(1) << 4)) {
            x >>= 4;
            msb += 4;
        }
        if (x >= (uint256(1) << 2)) {
            x >>= 2;
            msb += 2;
        }
        if (x >= (uint256(1) << 1)) {
            msb += 1;
        }
    }

    /* --------------------------------------------------------------------- */
    /*                          KEEPER MANAGEMENT                            */
    /* --------------------------------------------------------------------- */

    /**
     * @notice Add an address to, or remove it from, the keeper set: the addresses
     *         allowed to run the arbitrage and the liquidity rebalancing.
     * @param keeper Address whose status changes.
     * @param status True to authorise, false to revoke.
     */
    function setKeeper(address keeper, bool status) external onlyOwner {
        require(keeper != address(0), "MarketMaker: keeper is the zero address");

        isKeeper[keeper] = status;

        emit KeeperUpdated(keeper, status);
    }

    /* --------------------------------------------------------------------- */
    /*                          ADMINISTRATION                               */
    /* --------------------------------------------------------------------- */

    /**
     * @notice Point the market maker at another treasury (and therefore another
     *         reserve, NAV Floor and flash-loan venue).
     * @param newTreasury Address of the new treasury contract.
     */
    function setTreasury(address newTreasury) external onlyOwner {
        require(
            newTreasury != address(0),
            "MarketMaker: treasury is the zero address"
        );
        require(
            newTreasury.code.length > 0,
            "MarketMaker: treasury is not a contract"
        );

        address previousTreasury = address(treasury);
        treasury = ITreasury(newTreasury);

        emit TreasuryUpdated(previousTreasury, newTreasury);
    }

    /**
     * @notice Point the market maker at another DEX router / pool.
     * @param newRouter Address of the new router contract.
     */
    function setRouter(address newRouter) external onlyOwner {
        require(
            newRouter != address(0),
            "MarketMaker: router is the zero address"
        );
        require(
            newRouter.code.length > 0,
            "MarketMaker: router is not a contract"
        );

        address previousRouter = address(router);
        router = IDEXRouter(newRouter);

        emit RouterUpdated(previousRouter, newRouter);
    }

    /**
     * @notice Set the default half width, in ticks, of the liquidity band that
     *         {rebalanceLiquidity} derives from the NAV Floor.
     * @param newWidthTicks New half width; one tick is a 1.0001 price step, so
     *                      the band covers roughly +-`newWidthTicks * 1` bps.
     */
    function setRangeWidthTicks(uint256 newWidthTicks) external onlyOwner {
        require(
            newWidthTicks > 0 && newWidthTicks <= MAX_RANGE_WIDTH_TICKS,
            "MarketMaker: invalid range width"
        );

        uint256 previousWidth = rangeWidthTicks;
        rangeWidthTicks = newWidthTicks;

        emit RangeWidthUpdated(previousWidth, newWidthTicks);
    }

    /**
     * @notice Recompute and store the liquidity band from the current NAV Floor
     *         using the default {rangeWidthTicks}.
     * @dev    Callable by a keeper whenever the floor moved, so the stored band
     *         can be inspected before {rebalanceLiquidity} is executed.
     * @return tickLower Lower tick of the new band.
     * @return tickUpper Upper tick of the new band.
     */
    function refreshLiquidityRange()
        external
        onlyKeeper
        returns (int24 tickLower, int24 tickUpper)
    {
        uint256 floor = treasury.navFloor();
        (tickLower, tickUpper) = _rangeFromFloor(
            _tickAtFloor(floor),
            rangeWidthTicks
        );

        rangeTickLower = tickLower;
        rangeTickUpper = tickUpper;

        emit LiquidityRangeUpdated(tickLower, tickUpper, floor);
    }

    /* --------------------------------------------------------------------- */
    /*                           FLOOR ARBITRAGE                             */
    /* --------------------------------------------------------------------- */

    /**
     * @notice Buy NAVIS below the NAV Floor with a zero-fee USDT flash loan and
     *         burn the bought tokens, which lifts the floor for every remaining
     *         holder.
     *
     * @dev    Flow:
     *           1. require the caller to be a keeper and the USDT float to cover
     *              the principal (the loan itself is fully spent on the buyback,
     *              see the contract level notes);
     *           2. call {ITreasury-flashLoanUSDT}, which transfers `usdtAmount`
     *              USDT here and then calls {onFlashLoan};
     *           3. the callback swaps the loan for NAVIS on the router, checks
     *              that the swap really happened below the floor and returns the
     *              principal out of the USDT float;
     *           4. the treasury checks that its whole reserve is back, so the
     *              market maker can never walk away with the loan;
     *           5. burn the bought tokens through {ITreasury-burnBoughtBack}:
     *              the supply shrinks, the reserve does not, so the floor of
     *              every remaining holder rises.
     *
     *         The burn cannot happen inside the callback: the treasury guards
     *         {ITreasury-flashLoanUSDT} with a re-entrancy lock that
     *         {ITreasury-burnBoughtBack} shares, so it is executed right after
     *         the loan has been closed.
     *
     *         The market maker has to be whitelisted in the treasury for the
     *         flash loan (the token owner whitelists it at deployment time).
     *
     * @param  usdtAmount       USDT to borrow and spend (USDT base units).
     * @param  minTokensExpected Minimum NAVIS the swap must return; reverts the
     *                           whole round when the pool is not cheap enough.
     */
    function executeBelowFloorArbitrage(
        uint256 usdtAmount,
        uint256 minTokensExpected
    ) external onlyKeeper nonReentrant {
        require(
            usdtAmount > 0,
            "MarketMaker: amount must be greater than zero"
        );
        // The floor the round is judged against is read *before* the loan leaves
        // the reserve: for the duration of the loan the treasury looks poorer
        // than it is, and both the pricing check and the {ArbitrageExecuted}
        // record have to use the reference the round really started from.
        uint256 floorBefore = treasury.navFloor();
        require(floorBefore > 0, "MarketMaker: NAV floor is zero");
        require(
            usdt.balanceOf(address(this)) >= usdtAmount,
            "MarketMaker: USDT float cannot repay the flash loan"
        );

        // Fresh buyback record for the callback the flash loan will invoke.
        _pendingTokensBought = 0;
        _pendingFloorBefore = floorBefore;

        _arbitrageActive = true;

        treasury.flashLoanUSDT(
            usdtAmount,
            address(this),
            abi.encode(minTokensExpected)
        );

        _arbitrageActive = false;

        uint256 tokensBought = _pendingTokensBought;
        require(
            tokensBought > 0,
            "MarketMaker: flash loan bought no tokens"
        );

        // Burn the bought tokens: the supply shrinks, the reserve does not.
        IERC20(address(navToken)).forceApprove(address(treasury), tokensBought);
        treasury.burnBoughtBack(tokensBought);
        IERC20(address(navToken)).forceApprove(address(treasury), 0);

        uint256 floorAfter = treasury.navFloor();
        require(
            floorAfter >= floorBefore,
            "MarketMaker: NAV floor did not rise"
        );

        totalTokensBurned += tokensBought;
        totalUsdtSpentOnBuybacks += usdtAmount;
        arbitrageCount += 1;
        lastArbitrageAt = block.timestamp;
        lastTokensBurned = tokensBought;
        lastUsdtSpent = usdtAmount;

        emit ArbitrageExecuted(
            msg.sender,
            usdtAmount,
            tokensBought,
            floorBefore,
            floorAfter
        );
    }

    /**
     * @notice Callback through which the treasury hands over the flash loan.
     * @dev    Only the configured treasury may call it, only while
     *         {executeBelowFloorArbitrage} is waiting for a loan, and the loan
     *         must be in USDT and free of charge. The function deliberately
     *         carries no re-entrancy guard: it is executed *inside* the guarded
     *         {executeBelowFloorArbitrage} call, so a guard here would make every
     *         flash loan revert.
     *
     *         The callback swaps the whole loan for NAVIS and records the trade.
     *         The tokens are burned by {executeBelowFloorArbitrage} once the
     *         treasury has closed the loan, because {ITreasury-burnBoughtBack}
     *         runs behind the re-entrancy lock of the treasury and therefore
     *         cannot be called from inside {ITreasury-flashLoanUSDT}.
     *
     *         The `initiator` reported by the treasury is ignored on purpose:
     *         the treasury always names the market maker itself, so the keeper
     *         that started the round is read from `msg.sender` in
     *         {executeBelowFloorArbitrage}.
     * @param token     Loaned token; must be USDT.
     * @param amount    Loaned amount, returned to the treasury before returning.
     * @param fee       Fee charged on the loan; must be zero.
     * @param data      ABI encoded `minTokensExpected` set by the keeper.
     */
    function onFlashLoan(
        address /* initiator */,
        address token,
        uint256 amount,
        uint256 fee,
        bytes calldata data
    ) external override {
        require(
            msg.sender == address(treasury),
            "MarketMaker: caller is not the treasury"
        );
        require(
            token == address(usdt),
            "MarketMaker: unexpected flash-loan token"
        );
        require(fee == 0, "MarketMaker: unexpected flash-loan fee");
        require(_arbitrageActive, "MarketMaker: unexpected flash loan");

        uint256 minTokensExpected = abi.decode(data, (uint256));

        // The pricing reference is the floor {executeBelowFloorArbitrage}
        // captured before the loan left the reserve, so that neither the
        // outstanding principal nor the burn that follows can move it.
        uint256 floorBefore = _pendingFloorBefore;
        require(floorBefore > 0, "MarketMaker: NAV floor is zero");

        // 1. Buy NAVIS on the DEX with the whole loan.
        uint256 tokensBought = _buyNavisWith(amount, minTokensExpected);

        // 2. The trade must really be an arbitrage: what was paid has to be
        //    worth less than the floor value of the tokens received.
        require(
            (tokensBought * floorBefore) / NAVIS_SCALE > amount,
            "MarketMaker: swap is not below the NAV floor"
        );

        // 3. Hand the bought tokens over to the caller, which burns them as soon
        //    as the treasury has closed this loan (see the notes above).
        _pendingTokensBought = tokensBought;

        // 4. Return the principal out of the USDT float.
        usdt.safeTransfer(address(treasury), amount);
    }

    /**
     * @dev Sells `usdtAmount` USDT for NAVIS on the configured router.
     * @return tokensBought NAVIS received.
     */
    function _buyNavisWith(
        uint256 usdtAmount,
        uint256 minTokensExpected
    ) internal returns (uint256 tokensBought) {
        usdt.forceApprove(address(router), usdtAmount);
        uint256[] memory amounts = router.swapExactTokensForTokens(
            usdtAmount,
            minTokensExpected,
            _usdtToNavisPath(),
            address(this),
            block.timestamp
        );
        usdt.forceApprove(address(router), 0);

        tokensBought = amounts[amounts.length - 1];
        require(tokensBought > 0, "MarketMaker: swap returned no tokens");
    }

    /* --------------------------------------------------------------------- */
    /*                     LIQUIDITY / MARKET MAKING                         */
    /* --------------------------------------------------------------------- */

    /**
     * @notice Rebalance the concentrated liquidity around the current NAV Floor:
     *         derive the tick band from the floor, buy the NAVIS half of the
     *         position on the DEX and mint the position on the router.
     *
     * @dev    The band is symmetric around {tickAtFloor} and contains the floor
     *         tick by construction, so the freshly minted liquidity is always
     *         sitting where the protocol thinks the fair price is. Half of
     *         `usdtAmount` is swapped for NAVIS (the base side of the pool) and
     *         the other half is paired with it as USDT.
     *
     * @param  usdtAmount        Total USDT the market maker contributes.
     * @param  minTokensExpected Minimum NAVIS the first half-swap must return.
     * @param  widthTicks        Half width of the band in ticks; pass 0 to use
     *                           the stored {rangeWidthTicks}.
     * @return positionId        Identifier of the minted position.
     * @return liquidity         Liquidity units minted.
     */
    function rebalanceLiquidity(
        uint256 usdtAmount,
        uint256 minTokensExpected,
        uint256 widthTicks
    )
        external
        onlyKeeper
        nonReentrant
        returns (uint256 positionId, uint128 liquidity)
    {
        require(
            usdtAmount > 0,
            "MarketMaker: amount must be greater than zero"
        );
        require(
            usdt.balanceOf(address(this)) >= usdtAmount,
            "MarketMaker: insufficient USDT balance"
        );

        uint256 floor = treasury.navFloor();
        (int24 tickLower, int24 tickUpper) = _rangeFromFloor(
            _tickAtFloor(floor),
            widthTicks == 0 ? rangeWidthTicks : widthTicks
        );

        rangeTickLower = tickLower;
        rangeTickUpper = tickUpper;

        emit LiquidityRangeUpdated(tickLower, tickUpper, floor);

        // Half of the budget becomes the NAVIS side of the position.
        uint256 usdtToSwap = usdtAmount / 2;
        uint256 usdtPaired = usdtAmount - usdtToSwap;

        uint256 navisBought = _buyNavisWith(usdtToSwap, minTokensExpected);

        IERC20(address(navToken)).forceApprove(address(router), navisBought);
        usdt.forceApprove(address(router), usdtPaired);
        (positionId, liquidity) = router.mintPosition(
            address(navToken),
            address(usdt),
            tickLower,
            tickUpper,
            navisBought,
            usdtPaired,
            address(this)
        );
        IERC20(address(navToken)).forceApprove(address(router), 0);
        usdt.forceApprove(address(router), 0);

        lastPositionId = positionId;

        emit LiquidityRebalanced(
            positionId,
            tickLower,
            tickUpper,
            usdtAmount,
            navisBought,
            usdtPaired,
            liquidity
        );
    }

    /**
     * @notice Withdraw a liquidity position and forward both tokens to `to`.
     * @param positionId Identifier of the position to withdraw.
     * @param to         Recipient of the withdrawn tokens.
     * @return navisOut NAVIS returned by the router.
     * @return usdtOut  USDT returned by the router.
     */
    function removeLiquidity(
        uint256 positionId,
        address to
    ) external onlyKeeper nonReentrant returns (uint256 navisOut, uint256 usdtOut) {
        require(to != address(0), "MarketMaker: recipient is the zero address");

        (navisOut, usdtOut) = router.removePosition(positionId, to);

        emit LiquidityRemoved(positionId, to, navisOut, usdtOut);
    }

    /* --------------------------------------------------------------------- */
    /*                             USDT FLOAT                                */
    /* --------------------------------------------------------------------- */

    /**
     * @notice Fund the USDT float that repays the flash loans and pays for the
     *         liquidity positions.
     * @dev    Permissionless on purpose: keepers can top up their own working
     *         capital. The caller must have approved this contract first.
     * @param amount Amount of USDT to add (USDT base units).
     */
    function depositUSDT(uint256 amount) external {
        require(amount > 0, "MarketMaker: amount must be greater than zero");

        usdt.safeTransferFrom(msg.sender, address(this), amount);

        emit UsdtDeposited(msg.sender, amount);
    }

    /**
     * @notice Withdraw USDT from the float back to governance.
     * @param amount Amount of USDT to withdraw (USDT base units).
     * @param to     Recipient of the USDT.
     */
    function withdrawUSDT(uint256 amount, address to) external onlyOwner {
        require(amount > 0, "MarketMaker: amount must be greater than zero");
        require(to != address(0), "MarketMaker: recipient is the zero address");

        usdt.safeTransfer(to, amount);

        emit UsdtWithdrawn(to, amount);
    }
}


