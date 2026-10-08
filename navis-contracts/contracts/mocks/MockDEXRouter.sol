// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IDEXRouter} from "../MarketMaker.sol";

/**
 * @title  MockDEXRouter
 * @notice Testing helper that plays the role of the DEX (router + pool) the
 *         market maker trades against, without pulling in a full PancakeSwap
 *         deployment.
 *
 * @dev    It offers two surfaces:
 *
 *           1. swaps     - a two-token USDT/NAVIS pool priced with the classic
 *                          constant-product formula and a configurable fee, i.e.
 *                          the same math as a V2 style router;
 *           2. positions - a V3 style concentrated-liquidity position registry
 *                          storing the tick range it was minted with, so the
 *                          test-suite can assert on the range the market maker
 *                          derived from the NAV Floor.
 *
 *         Reserves are configured by the test-suite through {setReserves}; the
 *         price of a NAVIS is therefore `usdtReserve * 1e18 / navisReserve`
 *         expressed in USDT base units.
 *
 *         Only used in the Hardhat test-suite.
 */
contract MockDEXRouter is IDEXRouter {
    using SafeERC20 for IERC20;

    /// @notice Fixed scale of a whole NAVIS token (18 decimals).
    uint256 public constant NAVIS_SCALE = 1e18;

    /// @notice Basis-point denominator.
    uint256 public constant BPS = 10_000;

    /// @dev Ticks are bounded the same way Uniswap V3 bounds them.
    int24 private constant MIN_TICK = -887272;
    int24 private constant MAX_TICK = 887272;

    /// @notice Token of the quote asset of the pool (USDT).
    IERC20 public immutable usdt;

    /// @notice Token of the base asset of the pool (NAVIS).
    IERC20 public immutable navToken;

    /// @notice Swap fee in basis points (25 bps = 0.25%).
    uint256 public feeBps = 25;

    /// @notice NAVIS side of the pool.
    uint256 public navisReserve;

    /// @notice USDT side of the pool.
    uint256 public usdtReserve;

    /// @notice Concentrated-liquidity position, as recorded at mint time.
    struct Position {
        address owner;
        address tokenA;
        address tokenB;
        int24 tickLower;
        int24 tickUpper;
        uint256 amountA;
        uint256 amountB;
    }

    /// @notice Number of positions minted so far (also the last position id).
    uint256 public positionCount;

    /// @notice Position registry.
    mapping(uint256 => Position) public positions;

    /// @notice Emitted when the test-suite reconfigures the pool reserves.
    event ReservesUpdated(uint256 navisReserve, uint256 usdtReserve);

    /// @notice Emitted when the swap fee is updated.
    event FeeUpdated(uint256 feeBps);

    /// @notice Emitted for every swap, in either direction.
    event Swapped(
        address indexed sender,
        address indexed tokenIn,
        uint256 amountIn,
        uint256 amountOut,
        address indexed to
    );

    /// @notice Emitted when a concentrated-liquidity position is minted.
    event PositionMinted(
        uint256 indexed positionId,
        address indexed owner,
        int24 tickLower,
        int24 tickUpper,
        uint256 amountA,
        uint256 amountB,
        uint128 liquidity
    );

    /// @notice Emitted when a position is withdrawn.
    event PositionRemoved(
        uint256 indexed positionId,
        address indexed to,
        uint256 amountA,
        uint256 amountB
    );

    /**
     * @param usdt_     Address of the USDT token.
     * @param navToken_ Address of the NAVIS token.
     */
    constructor(address usdt_, address navToken_) {
        require(
            usdt_ != address(0) && navToken_ != address(0),
            "MockDEXRouter: token is the zero address"
        );

        usdt = IERC20(usdt_);
        navToken = IERC20(navToken_);
    }

    /* --------------------------------------------------------------------- */
    /*                          TEST CONFIGURATION                           */
    /* --------------------------------------------------------------------- */

    /// @notice Set the pool reserves (test helper).
    function setReserves(uint256 navisReserve_, uint256 usdtReserve_) external {
        navisReserve = navisReserve_;
        usdtReserve = usdtReserve_;

        emit ReservesUpdated(navisReserve_, usdtReserve_);
    }

    /// @notice Set the swap fee in basis points (test helper).
    function setFeeBps(uint256 feeBps_) external {
        require(feeBps_ < BPS, "MockDEXRouter: fee too high");
        feeBps = feeBps_;

        emit FeeUpdated(feeBps_);
    }

    /* --------------------------------------------------------------------- */
    /*                                VIEWS                                  */
    /* --------------------------------------------------------------------- */

    /// @notice Marginal price of one NAVIS, in USDT base units.
    function priceOfNavisWad() external view returns (uint256) {
        if (navisReserve == 0) {
            return 0;
        }
        return (usdtReserve * NAVIS_SCALE) / navisReserve;
    }

    /// @inheritdoc IDEXRouter
    function getAmountsOut(
        uint256 amountIn,
        address[] calldata path
    ) external view returns (uint256[] memory amounts) {
        require(path.length >= 2, "MockDEXRouter: invalid path");

        amounts = new uint256[](path.length);
        amounts[0] = amountIn;

        for (uint256 i = 0; i + 1 < path.length; i++) {
            amounts[i + 1] = _getAmountOut(amountIn, path[i], path[i + 1]);
            amountIn = amounts[i + 1];
        }
    }

    /* --------------------------------------------------------------------- */
    /*                                SWAPS                                  */
    /* --------------------------------------------------------------------- */

    /// @inheritdoc IDEXRouter
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts) {
        require(block.timestamp <= deadline, "MockDEXRouter: expired");
        require(path.length == 2, "MockDEXRouter: invalid path");
        require(amountIn > 0, "MockDEXRouter: amount must be greater than zero");
        require(to != address(0), "MockDEXRouter: recipient is the zero address");

        uint256 amountOut = _getAmountOut(amountIn, path[0], path[1]);
        require(
            amountOut >= amountOutMin,
            "MockDEXRouter: insufficient output amount"
        );
        require(amountOut > 0, "MockDEXRouter: insufficient liquidity");

        IERC20(path[0]).safeTransferFrom(msg.sender, address(this), amountIn);

        if (path[0] == address(usdt)) {
            usdtReserve += amountIn;
            navisReserve -= amountOut;
        } else {
            navisReserve += amountIn;
            usdtReserve -= amountOut;
        }

        IERC20(path[1]).safeTransfer(to, amountOut);

        amounts = new uint256[](2);
        amounts[0] = amountIn;
        amounts[1] = amountOut;

        emit Swapped(msg.sender, path[0], amountIn, amountOut, to);

        // Hook used by the re-entrant mock to attack the caller mid-swap.
        _afterSwap();
    }

    /// @dev Overridden by {ReentrantDEXRouter}; does nothing by default.
    function _afterSwap() internal virtual {}

    /* --------------------------------------------------------------------- */
    /*                        CONCENTRATED LIQUIDITY                         */
    /* --------------------------------------------------------------------- */

    /**
     * @inheritdoc IDEXRouter
     * @dev The mock simply pulls both amounts and records them together with the
     *      tick range; liquidity is reported as the smaller of the two raw
     *      amounts, which is enough for the test-suite to assert on.
     */
    function mintPosition(
        address tokenA,
        address tokenB,
        int24 tickLower,
        int24 tickUpper,
        uint256 amountADesired,
        uint256 amountBDesired,
        address to
    ) external returns (uint256 positionId, uint128 liquidity) {
        require(to != address(0), "MockDEXRouter: recipient is the zero address");
        require(tickLower < tickUpper, "MockDEXRouter: invalid tick range");
        require(
            tickLower >= MIN_TICK && tickUpper <= MAX_TICK,
            "MockDEXRouter: ticks out of bounds"
        );
        require(
            (tokenA == address(navToken) && tokenB == address(usdt)) ||
                (tokenA == address(usdt) && tokenB == address(navToken)),
            "MockDEXRouter: unsupported pair"
        );
        require(
            amountADesired > 0 && amountBDesired > 0,
            "MockDEXRouter: amount must be greater than zero"
        );

        positionId = ++positionCount;
        liquidity = uint128(
            amountADesired < amountBDesired ? amountADesired : amountBDesired
        );

        positions[positionId] = Position({
            owner: to,
            tokenA: tokenA,
            tokenB: tokenB,
            tickLower: tickLower,
            tickUpper: tickUpper,
            amountA: amountADesired,
            amountB: amountBDesired
        });

        IERC20(tokenA).safeTransferFrom(msg.sender, address(this), amountADesired);
        IERC20(tokenB).safeTransferFrom(msg.sender, address(this), amountBDesired);

        emit PositionMinted(
            positionId,
            to,
            tickLower,
            tickUpper,
            amountADesired,
            amountBDesired,
            liquidity
        );
    }

    /// @inheritdoc IDEXRouter
    function removePosition(
        uint256 positionId,
        address to
    ) external returns (uint256 amountA, uint256 amountB) {
        Position memory position = positions[positionId];

        require(position.owner != address(0), "MockDEXRouter: unknown position");
        require(
            position.owner == msg.sender,
            "MockDEXRouter: caller is not the position owner"
        );
        require(to != address(0), "MockDEXRouter: recipient is the zero address");

        delete positions[positionId];

        IERC20(position.tokenA).safeTransfer(to, position.amountA);
        IERC20(position.tokenB).safeTransfer(to, position.amountB);

        emit PositionRemoved(positionId, to, position.amountA, position.amountB);

        return (position.amountA, position.amountB);
    }

    /* --------------------------------------------------------------------- */
    /*                               INTERNAL                                */
    /* --------------------------------------------------------------------- */

    /// @dev Constant-product quote with the configured fee, mirroring a V2 pool.
    function _getAmountOut(
        uint256 amountIn,
        address tokenIn,
        address tokenOut
    ) internal view returns (uint256) {
        require(
            (tokenIn == address(usdt) && tokenOut == address(navToken)) ||
                (tokenIn == address(navToken) && tokenOut == address(usdt)),
            "MockDEXRouter: unsupported path"
        );

        if (amountIn == 0) {
            return 0;
        }

        uint256 amountInAfterFee = (amountIn * (BPS - feeBps)) / BPS;
        uint256 reserveIn = tokenIn == address(usdt) ? usdtReserve : navisReserve;
        uint256 reserveOut = tokenIn == address(usdt) ? navisReserve : usdtReserve;

        if (reserveIn == 0 || reserveOut == 0) {
            return 0;
        }

        return (reserveOut * amountInAfterFee) / (reserveIn + amountInAfterFee);
    }
}
