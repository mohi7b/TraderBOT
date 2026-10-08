// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/**
 * @title  Vesting
 * @author NAV Ecosystem
 * @notice Time-release custody of the non-circulating NAVIS allocations: the
 *         team and marketing buckets of the tokenomics (any other bucket - the
 *         presale or the liquidity pool - can be parked here as well).
 *
 *         A schedule is the pair (beneficiary, role label) plus the four
 *         parameters that define its unlock curve:
 *
 *             start     timestamp the curve is anchored to
 *             cliff     seconds to wait after `start` before anything unlocks
 *             duration  seconds after `start` until the allocation is fully vested
 *             total     amount of NAVIS of the schedule
 *
 *         The curve is linear from `start` and simply frozen during the cliff:
 *
 *             elapsed <  cliff      -> 0
 *             elapsed >= duration   -> total
 *             otherwise             -> total * elapsed / duration
 *
 *         so a 12-month cliff on a 36-month schedule unlocks exactly one third
 *         at the cliff. {release} pays out whatever is vested but not yet
 *         released; it may be called by anybody, which keeps the module usable
 *         without an operator (a beneficiary contract or a keeper can settle its
 *         own schedule).
 *
 *         `revocable` schedules can be terminated early through {revoke}: the
 *         beneficiary keeps everything that has vested until then (released
 *         immediately) while the unvested remainder returns to the unallocated
 *         pool of the contract, where it is available for new schedules or for
 *         {sweepUnallocated}. Non-revocable schedules are immutable promises.
 *
 *         Two automated distribution paths sit next to the single-schedule
 *         administration:
 *
 *         * {createSchedulesBatch} books a whole payout sheet in one
 *           transaction (atomic: any invalid line rolls the batch back), and
 *           {releaseBatch} lets a keeper settle many schedules at once;
 *         * a Merkle claim campaign reserves a budget for allocations that are
 *           not known as schedules: the owner publishes the root of
 *           `keccak256(abi.encode(campaignId, account, amount))` leaves and any
 *           wallet can pull its own amount with {claim} (a keeper can pay on
 *           behalf of a wallet through {claimFor}). The reserved budgets are
 *           deducted from the free balance, so an automated distribution can
 *           never be starved by a manual allocation.
 *
 *         {KEEPER_ROLE} is the operator role of those automations (a relayer or
 *         a cron job): it may settle schedules and pay committed campaign
 *         allocations, but it can never create a schedule, change a campaign
 *         root, mint or sweep. The owner grants it with {grantKeeper}, which
 *         needs {DEFAULT_ADMIN_ROLE} on the caller - the owner holds that role
 *         and follows every ownership transfer, so the operator register is
 *         always manageable by the wallet that owns the contract.
 *
 * @dev    Funding model: the contract works on its own balance. Tokens arrive
 *         either out of band ({deposit}, `safeTransferFrom`) or through the
 *         token owner during the deployment bootstrap (the deployer mints the
 *         team / marketing allocation to this address before handing the NAVIS
 *         token over to the presale, see `scripts/deploy.js`). A schedule can
 *         only be created while the *unallocated* balance covers it:
 *
 *             freeBalance = balanceOf(this)
 *                         - (totalAllocated - totalReleased)
 *                         - campaignReserved
 *
 *         which makes the promise to every beneficiary verifiable from the
 *         outside: allocated-but-unreleased tokens and unclaimed campaign
 *         budgets can never be swept.
 */
contract Vesting is Ownable, AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Fixed scale of a whole NAVIS token (18 decimals).
    uint256 public constant NAVIS_SCALE = 1e18;

    /// @notice Denominator of a role share in basis points (10,000 == 100%).
    uint256 public constant BPS_DENOMINATOR = 10_000;

    /**
     * @notice Role allowed to run the automated distribution paths.
     * @dev    Granted by the owner through {grantKeeper}; the role may only
     *         settle schedules and pay out campaign allocations that the
     *         owner already committed to - it can never mint, sweep or
     *         re-point a campaign.
     */
    bytes32 public constant KEEPER_ROLE = keccak256("KEEPER_ROLE");

    /// @notice NAVIS token held and released by this contract.
    IERC20 public immutable navToken;

    /**
     * @notice A single vesting promise.
     * @param beneficiary Receiver of the released tokens.
     * @param role        Human-readable bucket label ("team", "marketing", ...).
     * @param total       Amount of NAVIS of the schedule (1e18).
     * @param released    Amount of NAVIS already paid out (1e18).
     * @param start       Timestamp the curve is anchored to.
     * @param cliff       Seconds after `start` before anything unlocks.
     * @param duration    Seconds after `start` until the schedule is fully vested.
     * @param revocable   Whether the owner may revoke it through {revoke}.
     * @param revoked     Whether it was revoked (the curve is then frozen).
     */
    struct Schedule {
        address beneficiary;
        string role;
        uint256 total;
        uint256 released;
        uint64 start;
        uint64 cliff;
        uint64 duration;
        bool revocable;
        bool revoked;
    }

    /**
     * @notice One schedule of a batch, as accepted by {createSchedulesBatch}.
     * @param beneficiary Receiver of the released tokens.
     * @param role        Human-readable bucket label ("team", "marketing", ...).
     * @param total       Amount of NAVIS of the schedule (1e18).
     * @param start       Timestamp the curve is anchored to (0 = now).
     * @param cliffPeriod Seconds after `start` before anything unlocks.
     * @param vestingPeriod Seconds after `start` until the schedule is fully vested.
     * @param revocable   Whether the owner may revoke it through {revoke}.
     */
    struct ScheduleRequest {
        address beneficiary;
        string role;
        uint256 total;
        uint64 start;
        uint64 cliffPeriod;
        uint64 vestingPeriod;
        bool revocable;
    }

    /**
     * @notice A Merkle claim campaign ("automated" distribution bucket).
     * @param name   Human-readable label shown in the admin console.
     * @param role   Bucket label the campaign belongs to ("community", ...).
     * @param root   Merkle root of the `keccak256(abi.encode(campaignId, account, amount))` leaves.
     * @param budget NAVIS reserved for the campaign (1e18).
     * @param claimed NAVIS already paid out by the campaign (1e18).
     * @param start  Timestamp the campaign opens (0 = immediately).
     * @param end    Timestamp the campaign closes (0 = never).
     * @param active Whether claims are currently accepted.
     * @param cancelled Whether the campaign was cancelled (terminal).
     */
    struct Campaign {
        string name;
        string role;
        bytes32 root;
        uint256 budget;
        uint256 claimed;
        uint64 start;
        uint64 end;
        bool active;
        bool cancelled;
    }

    /// @notice All schedules, in creation order. The index is the schedule id.
    Schedule[] private _schedules;

    /// @notice Schedule ids per beneficiary, so a wallet can enumerate its own.
    mapping(address => uint256[]) private _beneficiaryIds;

    /// @notice Declared share of a bucket label in basis points.
    mapping(bytes32 => uint16) private _roleShareBps;

    /// @notice NAVIS ever put into schedules of a bucket label (1e18).
    mapping(bytes32 => uint256) private _roleAllocated;

    /// @notice NAVIS already released by the schedules of a bucket label (1e18).
    mapping(bytes32 => uint256) private _roleReleased;

    /// @notice Whether a bucket label was already registered (for enumeration).
    mapping(bytes32 => bool) private _roleDeclared;

    /// @notice Bucket labels in registration order, for the admin console.
    string[] private _roleLabels;

    /// @notice Total NAVIS of the schedules that are still promise-bound (1e18).
    uint256 public totalAllocated;

    /// @notice Total NAVIS already released to beneficiaries (1e18).
    uint256 public totalReleased;

    /// @notice All Merkle claim campaigns, in creation order. The index is the campaign id.
    Campaign[] private _campaigns;

    /// @notice NAVIS paid to a wallet by a campaign (1e18), so a claim can only happen once.
    mapping(uint256 => mapping(address => uint256)) private _campaignClaimed;

    /// @notice Wallets that claimed a campaign, for enumeration in the admin console.
    mapping(uint256 => address[]) private _campaignMembers;

    /**
     * @notice NAVIS of the campaign budgets that are still unclaimed (1e18).
     * @dev    Subtracted by {freeBalance}, so {sweepUnallocated} and {createCampaign}
     *         can never spend tokens a campaign already promised.
     */
    uint256 public campaignReserved;

    /// @notice Wallets currently holding {KEEPER_ROLE}, for enumeration in the admin console.
    address[] private _keepers;

    /**
     * @notice Emitted when a new vesting schedule is created.
     * @param id          Schedule id (index into the schedule list).
     * @param beneficiary Receiver of the releases.
     * @param role        Bucket label of the schedule.
     * @param total       Amount of NAVIS of the schedule (1e18).
     * @param start       Timestamp the curve is anchored to.
     * @param cliff       Cliff of the schedule in seconds.
     * @param duration    Vesting duration in seconds.
     * @param revocable   Whether the owner may revoke it.
     */
    event ScheduleCreated(
        uint256 indexed id,
        address indexed beneficiary,
        string role,
        uint256 total,
        uint64 start,
        uint64 cliff,
        uint64 duration,
        bool revocable
    );

    /**
     * @notice Emitted when a revocable schedule is terminated by the owner.
     * @param id       Revoked schedule.
     * @param returned Unvested NAVIS returned to the unallocated pool (1e18).
     */
    event ScheduleRevoked(uint256 indexed id, uint256 returned);

    /**
     * @notice Emitted on every payout of a schedule.
     * @param id          Schedule that paid out.
     * @param beneficiary Receiver of the tokens.
     * @param amount      Amount of NAVIS released (1e18).
     */
    event TokensReleased(
        uint256 indexed id,
        address indexed beneficiary,
        uint256 amount
    );

    /**
     * @notice Emitted when the declared share of a bucket label changes.
     * @param role        Bucket label.
     * @param previousBps Share before the update (basis points).
     * @param newBps      Share afterwards (basis points).
     */
    event RoleShareUpdated(string role, uint16 previousBps, uint16 newBps);

    /**
     * @notice Emitted when NAVIS are moved into the vesting pool.
     * @param from   Sender of the tokens.
     * @param amount Amount of NAVIS deposited (1e18).
     */
    event Deposited(address indexed from, uint256 amount);

    /**
     * @notice Emitted when unallocated NAVIS are withdrawn by the owner.
     * @param to     Receiver of the tokens.
     * @param amount Amount of NAVIS withdrawn (1e18).
     */
    event UnallocatedSwept(address indexed to, uint256 amount);

    /**
     * @notice Emitted once per {createSchedulesBatch} call.
     * @param ids         Schedule ids created by the batch, in input order.
     * @param totalAmount Sum of the NAVIS of the batch (1e18).
     */
    event SchedulesCreated(uint256[] ids, uint256 totalAmount);

    /**
     * @notice Emitted when a keeper settles several schedules in one transaction.
     * @param keeper     Keeper that called {releaseBatch}.
     * @param schedules  Number of schedules that actually paid out.
     * @param amount     NAVIS released by the batch (1e18).
     */
    event SchedulesSettled(address indexed keeper, uint256 schedules, uint256 amount);

    /**
     * @notice Emitted when the owner grants or revokes {KEEPER_ROLE}.
     * @param keeper  Wallet added to or removed from the role.
     * @param granted True when the wallet became a keeper.
     */
    event KeeperUpdated(address indexed keeper, bool granted);

    /**
     * @notice Emitted when a Merkle claim campaign is created.
     * @param id     Campaign id (index into the campaign list).
     * @param name   Human-readable label of the campaign.
     * @param role   Bucket label the campaign belongs to.
     * @param root   Merkle root of the campaign leaves.
     * @param budget NAVIS reserved for the campaign (1e18).
     * @param start  Timestamp the campaign opens (0 = immediately).
     * @param end    Timestamp the campaign closes (0 = never).
     */
    event CampaignCreated(
        uint256 indexed id,
        string name,
        string role,
        bytes32 root,
        uint256 budget,
        uint64 start,
        uint64 end
    );

    /**
     * @notice Emitted when the owner re-points a campaign root or window.
     * @param id   Campaign updated.
     * @param root Merkle root afterwards.
     * @param start Timestamp the campaign opens afterwards.
     * @param end   Timestamp the campaign closes afterwards.
     */
    event CampaignUpdated(uint256 indexed id, bytes32 root, uint64 start, uint64 end);

    /**
     * @notice Emitted when a campaign is paused, resumed or cancelled.
     * @param id      Campaign updated.
     * @param active  Whether claims are accepted afterwards.
     * @param cancelled Whether the campaign was cancelled.
     */
    event CampaignStatusUpdated(uint256 indexed id, bool active, bool cancelled);

    /**
     * @notice Emitted when the owner adds tokens to a campaign budget.
     * @param id     Campaign topped up.
     * @param amount NAVIS added (1e18).
     * @param budget Budget of the campaign afterwards (1e18).
     */
    event CampaignFunded(uint256 indexed id, uint256 amount, uint256 budget);

    /**
     * @notice Emitted when a campaign pays a wallet.
     * @param id      Campaign that paid out.
     * @param account Receiver of the tokens.
     * @param caller  Wallet that submitted the claim (the keeper for {claimFor}).
     * @param amount  NAVIS paid (1e18).
     */
    event CampaignClaimed(
        uint256 indexed id,
        address indexed account,
        address indexed caller,
        uint256 amount
    );

    /**
     * @notice Emitted when a campaign is cancelled and its budget returns to the pool.
     * @param id        Campaign cancelled.
     * @param returned  Unclaimed NAVIS freed for other allocations (1e18).
     */
    event CampaignCancelled(uint256 indexed id, uint256 returned);

    /**
     * @param initialOwner Address able to manage schedules and role shares.
     * @param navToken_    Address of the NAVIS token held by this contract.
     */
    constructor(address initialOwner, address navToken_) Ownable(initialOwner) {
        require(navToken_ != address(0), "Vesting: NAV token is the zero address");
        navToken = IERC20(navToken_);
    }

    /**
     * @dev Keeps the administration of the roles in step with the ownership.
     *
     *      {grantKeeper} hands out {KEEPER_ROLE} through `AccessControl.grantRole`,
     *      which only the admin of the role may call; the admin of {KEEPER_ROLE} is
     *      {DEFAULT_ADMIN_ROLE}, and AccessControl grants it to nobody by itself.
     *      Tying the two together means the owner of the contract is always the
     *      wallet able to appoint an operator - at deployment and after every
     *      {Ownable-transferOwnership} - while no other path can mint an admin.
     *      Without this, {KEEPER_ROLE} could never be assigned and the automation
     *      entry points ({releaseBatch}, {claimFor}) would be unreachable.
     *
     * @param newOwner Owner of the contract afterwards (the zero address when
     *                 ownership is renounced, which also drops the admin role).
     */
    function _transferOwnership(address newOwner) internal override {
        address previousOwner = owner();
        super._transferOwnership(newOwner);

        if (previousOwner != address(0) && previousOwner != newOwner) {
            _revokeRole(DEFAULT_ADMIN_ROLE, previousOwner);
        }
        if (newOwner != address(0)) {
            _grantRole(DEFAULT_ADMIN_ROLE, newOwner);
        }
    }

    /* --------------------------------------------------------------------- */
    /*                              VIEW HELPERS                             */
    /* --------------------------------------------------------------------- */

    /// @notice Number of schedules created so far.
    function scheduleCount() external view returns (uint256) {
        return _schedules.length;
    }

    /**
     * @notice Full schedule `id`.
     * @param id Schedule id (0-based, creation order).
     */
    function getSchedule(uint256 id) external view returns (Schedule memory) {
        require(id < _schedules.length, "Vesting: invalid schedule id");
        return _schedules[id];
    }

    /// @notice Schedule ids created for `beneficiary`.
    function schedulesOf(
        address beneficiary
    ) external view returns (uint256[] memory) {
        return _beneficiaryIds[beneficiary];
    }

    /// @notice Number of bucket labels registered so far.
    function roleCount() external view returns (uint256) {
        return _roleLabels.length;
    }

    /// @notice Bucket label at `index` of the registration list.
    function roleLabelAt(uint256 index) external view returns (string memory) {
        require(index < _roleLabels.length, "Vesting: invalid role index");
        return _roleLabels[index];
    }

    /// @notice Declared share of the bucket `role` in basis points.
    function roleShare(string calldata role) external view returns (uint16) {
        return _roleShareBps[_key(role)];
    }

    /// @notice NAVIS ever committed to schedules labelled `role` (1e18).
    function roleAllocated(string calldata role) external view returns (uint256) {
        return _roleAllocated[_key(role)];
    }

    /// @notice NAVIS already released by the schedules labelled `role` (1e18).
    function roleReleased(string calldata role) external view returns (uint256) {
        return _roleReleased[_key(role)];
    }

    /// @notice Sum of every declared bucket share, in basis points.
    function roleShareTotalBps() external view returns (uint256 total) {
        for (uint256 i = 0; i < _roleLabels.length; i++) {
            total += _roleShareBps[_key(_roleLabels[i])];
        }
    }

    /// @notice NAVIS balance held by this contract (1e18).
    function vestingBalance() external view returns (uint256) {
        return navToken.balanceOf(address(this));
    }

    /**
     * @notice NAVIS that are not backing a promise and may be allocated to a new
     *         schedule or withdrawn through {sweepUnallocated} (1e18).
     * @dev    Campaign budgets count as reserved: the unclaimed part of every
     *         Merkle campaign is subtracted here, so an automated distribution
     *         can never be starved by a manual allocation.
     */
    function freeBalance() public view returns (uint256) {
        uint256 held = navToken.balanceOf(address(this));
        uint256 reserved = totalAllocated - totalReleased + campaignReserved;
        return held > reserved ? held - reserved : 0;
    }

    /**
     * @notice Amount of NAVIS of schedule `id` the curve has unlocked by now.
     * @param id Schedule id.
     */
    function vestedAmount(uint256 id) public view returns (uint256) {
        require(id < _schedules.length, "Vesting: invalid schedule id");
        return _vested(_schedules[id]);
    }

    /**
     * @notice Amount of NAVIS of schedule `id` that can be paid out right now,
     *         i.e. the vested part minus what was already released.
     * @param id Schedule id.
     */
    function releasableAmount(uint256 id) public view returns (uint256) {
        require(id < _schedules.length, "Vesting: invalid schedule id");
        Schedule storage schedule = _schedules[id];
        uint256 vested = _vested(schedule);
        return vested > schedule.released ? vested - schedule.released : 0;
    }

    /* --------------------------------------------------------------------- */
    /*                                 FUNDING                               */
    /* --------------------------------------------------------------------- */

    /**
     * @notice Move `amount` NAVIS from the caller into the vesting pool.
     * @dev    The caller must have approved this contract first. The tokens are
     *         immediately allocatable to new schedules.
     * @param amount Amount of NAVIS to deposit (1e18).
     */
    function deposit(uint256 amount) external onlyOwner nonReentrant {
        require(amount > 0, "Vesting: amount must be greater than zero");
        navToken.safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(msg.sender, amount);
    }

    /**
     * @notice Withdraw NAVIS that do not back any schedule.
     * @dev    Only the free part of the balance can leave, so the promises made
     *         to the beneficiaries stay fully collateralised.
     * @param to     Receiver of the tokens.
     * @param amount Amount of NAVIS to withdraw (1e18).
     */
    function sweepUnallocated(
        address to,
        uint256 amount
    ) external onlyOwner nonReentrant {
        require(to != address(0), "Vesting: receiver is the zero address");
        require(amount > 0, "Vesting: amount must be greater than zero");
        require(
            amount <= freeBalance(),
            "Vesting: amount exceeds the unallocated balance"
        );

        navToken.safeTransfer(to, amount);
        emit UnallocatedSwept(to, amount);
    }

    /* --------------------------------------------------------------------- */
    /*                            ROLE ALLOCATIONS                           */
    /* --------------------------------------------------------------------- */

    /**
     * @notice Declare the share of a tokenomics bucket, in basis points.
     * @dev    Bookkeeping for governance: the sum of all declared shares can
     *         never exceed 100% ({BPS_DENOMINATOR}). The register does not move
     *         tokens - it documents what a bucket is *meant* to receive, so the
     *         admin console can flag a mismatch with the schedules that were
     *         actually created.
     * @param role     Bucket label, e.g. "team" or "marketing".
     * @param shareBps Share of the total supply in basis points (500 == 5%).
     */
    function setRoleShare(
        string calldata role,
        uint16 shareBps
    ) external onlyOwner {
        require(bytes(role).length > 0, "Vesting: role label is empty");
        require(shareBps <= BPS_DENOMINATOR, "Vesting: share above 100%");

        bytes32 key = _key(role);
        uint16 previousBps = _roleShareBps[key];
        uint256 totalAfter = _roleShareTotal() + shareBps - previousBps;
        require(totalAfter <= BPS_DENOMINATOR, "Vesting: shares exceed 100%");

        if (!_roleDeclared[key]) {
            _roleDeclared[key] = true;
            _roleLabels.push(role);
        }
        _roleShareBps[key] = shareBps;

        emit RoleShareUpdated(role, previousBps, shareBps);
    }

    /* --------------------------------------------------------------------- */
    /*                             KEEPER ACCESS                             */
    /* --------------------------------------------------------------------- */

    /// @notice Number of wallets currently holding {KEEPER_ROLE}.
    function keeperCount() external view returns (uint256) {
        return _keepers.length;
    }

    /// @notice Keeper at `index` of the register, in grant order.
    function keeperAt(uint256 index) external view returns (address) {
        require(index < _keepers.length, "Vesting: invalid keeper index");
        return _keepers[index];
    }

    /// @notice Whether `account` may run the automated distribution paths.
    function isKeeper(address account) public view returns (bool) {
        return hasRole(KEEPER_ROLE, account);
    }

    /**
     * @notice Let `keeper` settle schedules and pay campaign allocations.
     * @dev    A keeper cannot create a schedule, change a campaign root or move
     *         tokens anywhere but to the beneficiary recorded on chain. Handy
     *         for a relayer or cron job that only needs gas money.
     * @param keeper Wallet added to {KEEPER_ROLE}.
     */
    function grantKeeper(address keeper) external onlyOwner {
        require(keeper != address(0), "Vesting: keeper is the zero address");
        grantRole(KEEPER_ROLE, keeper);
    }

    /**
     * @notice Remove `keeper` from {KEEPER_ROLE}.
     * @param keeper Wallet removed from the role.
     */
    function revokeKeeper(address keeper) external onlyOwner {
        revokeRole(KEEPER_ROLE, keeper);
    }

    /// @dev Keeps the enumerable keeper register in sync with the role itself.
    function _grantRole(
        bytes32 role,
        address account
    ) internal override returns (bool granted) {
        granted = super._grantRole(role, account);
        if (granted && role == KEEPER_ROLE) {
            _keepers.push(account);
            emit KeeperUpdated(account, true);
        }
    }

    /// @dev Keeps the enumerable keeper register in sync with the role itself.
    function _revokeRole(
        bytes32 role,
        address account
    ) internal override returns (bool revoked) {
        revoked = super._revokeRole(role, account);
        if (revoked && role == KEEPER_ROLE) {
            uint256 length = _keepers.length;
            for (uint256 i = 0; i < length; i++) {
                if (_keepers[i] == account) {
                    _keepers[i] = _keepers[length - 1];
                    _keepers.pop();
                    break;
                }
            }
            emit KeeperUpdated(account, false);
        }
    }

    /* --------------------------------------------------------------------- */
    /*                               SCHEDULES                               */
    /* --------------------------------------------------------------------- */

    /**
     * @notice Create a vesting schedule for `beneficiary`.
     * @dev    The unallocated balance of the contract must cover `total`, so a
     *         schedule can only promise tokens that are really held here.
     *         A `start` of zero means "now", which is what a fresh allocation
     *         usually wants.
     * @param beneficiary   Receiver of the releases.
     * @param role          Bucket label ("team", "marketing", ...; may be empty).
     * @param total         Amount of NAVIS of the schedule (1e18).
     * @param start         Timestamp the curve is anchored to (0 == now).
     * @param cliffPeriod   Seconds after `start` before anything unlocks.
     * @param vestingPeriod Seconds after `start` until fully vested.
     * @param revocable     Whether the owner may revoke the schedule.
     * @return id           Id of the new schedule.
     */
    function createSchedule(
        address beneficiary,
        string calldata role,
        uint256 total,
        uint64 start,
        uint64 cliffPeriod,
        uint64 vestingPeriod,
        bool revocable
    ) external onlyOwner returns (uint256 id) {
        id = _createSchedule(
            beneficiary,
            role,
            total,
            start,
            cliffPeriod,
            vestingPeriod,
            revocable
        );
    }

    /**
     * @notice Create many vesting schedules in a single transaction.
     * @dev    The whole batch is atomic: if one request is invalid (zero
     *         beneficiary, empty amount, cliff above the vesting period, or a
     *         total that the unallocated balance cannot cover) every schedule
     *         of the call is rolled back. That makes a CSV payout sheet safe to
     *         submit in one go instead of one transaction per line.
     *         Requests are validated against the balance *after* the previous
     *         ones of the same batch were booked, so a batch can never promise
     *         more than the pool holds.
     * @param requests Schedules to create, in the order the ids are returned.
     * @return ids     Ids of the new schedules, aligned with `requests`.
     */
    function createSchedulesBatch(
        ScheduleRequest[] calldata requests
    ) external onlyOwner returns (uint256[] memory ids) {
        uint256 count = requests.length;
        require(count > 0, "Vesting: batch is empty");

        ids = new uint256[](count);
        uint256 allocated = 0;
        for (uint256 i = 0; i < count; i++) {
            ScheduleRequest calldata request = requests[i];
            ids[i] = _createSchedule(
                request.beneficiary,
                request.role,
                request.total,
                request.start,
                request.cliffPeriod,
                request.vestingPeriod,
                request.revocable
            );
            allocated += request.total;
        }

        emit SchedulesCreated(ids, allocated);
    }

    /**
     * @notice Pay out the vested part of schedule `id` to its beneficiary.
     * @dev    Permissionless on purpose: releasing only ever moves tokens to the
     *         beneficiary recorded at creation time.
     * @param  id Schedule id.
     * @return amount NAVIS transferred (1e18).
     */
    function release(uint256 id) external nonReentrant returns (uint256 amount) {
        require(id < _schedules.length, "Vesting: invalid schedule id");

        amount = releasableAmount(id);
        require(amount > 0, "Vesting: nothing to release");

        Schedule storage schedule = _schedules[id];
        schedule.released += amount;
        totalReleased += amount;
        _roleReleased[_key(schedule.role)] += amount;

        navToken.safeTransfer(schedule.beneficiary, amount);

        emit TokensReleased(id, schedule.beneficiary, amount);
    }

    /**
     * @notice Settle several schedules in one transaction.
     * @dev    Automation entry point: a keeper (see {KEEPER_ROLE}) runs this on a
     *         schedule to pay every beneficiary that has something to release,
     *         skipping the ones whose curve has not unlocked anything yet. The
     *         call never reverts on a "nothing to release" schedule, so a batch
     *         listing the whole book is always safe to submit.
     * @param  ids Schedule ids to settle.
     * @return total     NAVIS transferred by the batch (1e18).
     * @return settled   Number of schedules that actually paid out.
     */
    function releaseBatch(
        uint256[] calldata ids
    )
        external
        onlyRole(KEEPER_ROLE)
        nonReentrant
        returns (uint256 total, uint256 settled)
    {
        require(ids.length > 0, "Vesting: batch is empty");

        for (uint256 i = 0; i < ids.length; i++) {
            uint256 id = ids[i];
            require(id < _schedules.length, "Vesting: invalid schedule id");

            uint256 amount = releasableAmount(id);
            if (amount == 0) {
                continue;
            }

            Schedule storage schedule = _schedules[id];
            schedule.released += amount;
            totalReleased += amount;
            _roleReleased[_key(schedule.role)] += amount;

            navToken.safeTransfer(schedule.beneficiary, amount);

            total += amount;
            settled += 1;

            emit TokensReleased(id, schedule.beneficiary, amount);
        }

        emit SchedulesSettled(msg.sender, settled, total);
    }

    /**
     * @notice Terminate a revocable schedule early.
     * @dev    Everything that has vested until the current block is released to
     *         the beneficiary in the same call; only the unvested remainder is
     *         returned to the unallocated pool of the contract.
     * @param  id Schedule id.
     * @return returned Unvested NAVIS handed back to the pool (1e18).
     */
    function revoke(
        uint256 id
    ) external onlyOwner nonReentrant returns (uint256 returned) {
        require(id < _schedules.length, "Vesting: invalid schedule id");

        Schedule storage schedule = _schedules[id];
        require(!schedule.revoked, "Vesting: schedule already revoked");
        require(schedule.revocable, "Vesting: schedule is not revocable");

        uint256 vested = _vested(schedule);
        uint256 unlocked = vested > schedule.released
            ? vested - schedule.released
            : 0;

        if (unlocked > 0) {
            schedule.released += unlocked;
            totalReleased += unlocked;
            _roleReleased[_key(schedule.role)] += unlocked;
            navToken.safeTransfer(schedule.beneficiary, unlocked);
            emit TokensReleased(id, schedule.beneficiary, unlocked);
        }

        returned = schedule.total - schedule.released;
        schedule.revoked = true;
        totalAllocated -= returned;

        emit ScheduleRevoked(id, returned);
    }

    /* --------------------------------------------------------------------- */
    /*                               CAMPAIGNS                               */
    /* --------------------------------------------------------------------- */

    /// @notice Number of Merkle claim campaigns created so far.
    function campaignCount() external view returns (uint256) {
        return _campaigns.length;
    }

    /**
     * @notice Full campaign `id`.
     * @param id Campaign id (0-based, creation order).
     */
    function getCampaign(uint256 id) external view returns (Campaign memory) {
        require(id < _campaigns.length, "Vesting: invalid campaign id");
        return _campaigns[id];
    }

    /**
     * @notice NAVIS of campaign `id` that are still unclaimed (1e18).
     * @param id Campaign id.
     */
    function campaignRemaining(uint256 id) public view returns (uint256) {
        require(id < _campaigns.length, "Vesting: invalid campaign id");
        Campaign storage campaign = _campaigns[id];
        return campaign.budget > campaign.claimed
            ? campaign.budget - campaign.claimed
            : 0;
    }

    /// @notice NAVIS campaign `id` already paid to `account` (0 == never claimed).
    function campaignClaimedAmount(
        uint256 id,
        address account
    ) public view returns (uint256) {
        return _campaignClaimed[id][account];
    }

    /// @notice Whether `account` already took its allocation of campaign `id`.
    function isCampaignClaimed(
        uint256 id,
        address account
    ) external view returns (bool) {
        return _campaignClaimed[id][account] > 0;
    }

    /// @notice Number of wallets that claimed campaign `id`.
    function campaignMemberCount(uint256 id) external view returns (uint256) {
        return _campaignMembers[id].length;
    }

    /// @notice Wallet at `index` of the claim register of campaign `id`.
    function campaignMemberAt(
        uint256 id,
        uint256 index
    ) external view returns (address) {
        address[] storage members = _campaignMembers[id];
        require(index < members.length, "Vesting: invalid member index");
        return members[index];
    }

    /**
     * @notice Hash a campaign allocation must prove to be included in the root.
     * @dev    `keccak256(abi.encode(campaignId, account, amount))` hashed once
     *         more, exactly like {MerkleProof} hashes a leaf when it walks the
     *         tree. A wallet can only claim the amount of its own leaf, which is
     *         what makes the payout provable instead of trusted.
     * @param id      Campaign id.
     * @param account Wallet the allocation belongs to.
     * @param amount  NAVIS of the allocation (1e18).
     */
    function campaignLeaf(
        uint256 id,
        address account,
        uint256 amount
    ) public pure returns (bytes32) {
        return
            keccak256(
                bytes.concat(keccak256(abi.encode(id, account, amount)))
            );
    }

    /**
     * @notice Open a Merkle claim campaign funded from the unallocated pool.
     * @dev    The budget is reserved immediately: it is subtracted from
     *         {freeBalance} until it is claimed or the campaign is cancelled, so
     *         a later manual schedule can never spend it. Build the tree with
     *         the same leaf encoding as {campaignLeaf}; the admin console
     *         computes the root in the browser, so the owner only has to paste
     *         the CSV of allocations.
     * @param name   Human-readable label of the campaign.
     * @param role   Bucket label it belongs to ("community", ...; may be empty).
     * @param root   Merkle root of the allocations.
     * @param start  Timestamp the campaign opens (0 == immediately).
     * @param end    Timestamp the campaign closes (0 == never).
     * @param budget NAVIS reserved for the campaign (1e18).
     * @return id    Id of the new campaign.
     */
    function createCampaign(
        string calldata name,
        string calldata role,
        bytes32 root,
        uint64 start,
        uint64 end,
        uint256 budget
    ) external onlyOwner returns (uint256 id) {
        require(bytes(name).length > 0, "Vesting: campaign name is empty");
        require(root != bytes32(0), "Vesting: merkle root is empty");
        require(budget > 0, "Vesting: amount must be greater than zero");
        require(
            end == 0 || end > (start == 0 ? uint64(block.timestamp) : start),
            "Vesting: campaign window is inverted"
        );
        require(budget <= freeBalance(), "Vesting: unallocated balance too low");

        _campaigns.push(
            Campaign({
                name: name,
                role: role,
                root: root,
                budget: budget,
                claimed: 0,
                start: start,
                end: end,
                active: true,
                cancelled: false
            })
        );
        id = _campaigns.length - 1;
        campaignReserved += budget;
        _allocateRole(role, budget);

        emit CampaignCreated(id, name, role, root, budget, start, end);
    }

    /**
     * @notice Re-point the Merkle root of a campaign.
     * @dev    Lets the owner extend a running distribution without opening a
     *         second campaign. Every allocation already claimed keeps its leaf,
     *         so an extension must still include the previous members.
     * @param id   Campaign id.
     * @param root New Merkle root.
     */
    function setCampaignRoot(uint256 id, bytes32 root) external onlyOwner {
        require(id < _campaigns.length, "Vesting: invalid campaign id");
        require(root != bytes32(0), "Vesting: merkle root is empty");

        Campaign storage campaign = _campaigns[id];
        campaign.root = root;

        emit CampaignUpdated(id, root, campaign.start, campaign.end);
    }

    /**
     * @notice Move the claim window of a campaign.
     * @param id    Campaign id.
     * @param start Timestamp the campaign opens (0 == immediately).
     * @param end   Timestamp the campaign closes (0 == never).
     */
    function setCampaignWindow(
        uint256 id,
        uint64 start,
        uint64 end
    ) external onlyOwner {
        require(id < _campaigns.length, "Vesting: invalid campaign id");
        require(
            end == 0 || end > (start == 0 ? uint64(block.timestamp) : start),
            "Vesting: campaign window is inverted"
        );

        Campaign storage campaign = _campaigns[id];
        campaign.start = start;
        campaign.end = end;

        emit CampaignUpdated(id, campaign.root, start, end);
    }

    /**
     * @notice Pause or resume the claims of a campaign.
     * @param id     Campaign id.
     * @param active Whether claims are accepted afterwards.
     */
    function setCampaignActive(uint256 id, bool active) external onlyOwner {
        require(id < _campaigns.length, "Vesting: invalid campaign id");

        Campaign storage campaign = _campaigns[id];
        require(!campaign.cancelled, "Vesting: campaign was cancelled");
        campaign.active = active;

        emit CampaignStatusUpdated(id, active, false);
    }

    /**
     * @notice Add tokens to the budget of a campaign.
     * @param id     Campaign id.
     * @param amount NAVIS to reserve (1e18).
     */
    function topUpCampaign(uint256 id, uint256 amount) external onlyOwner {
        require(id < _campaigns.length, "Vesting: invalid campaign id");
        require(amount > 0, "Vesting: amount must be greater than zero");
        require(amount <= freeBalance(), "Vesting: unallocated balance too low");

        Campaign storage campaign = _campaigns[id];
        require(!campaign.cancelled, "Vesting: campaign was cancelled");

        campaign.budget += amount;
        campaignReserved += amount;
        _allocateRole(campaign.role, amount);

        emit CampaignFunded(id, amount, campaign.budget);
    }

    /**
     * @notice Cancel a campaign and return its unclaimed budget to the pool.
     * @dev    Tokens already paid stay paid; the unclaimed remainder becomes
     *         allocatable again ({freeBalance} grows back immediately) and the
     *         campaign is closed for good.
     * @param  id Campaign id.
     * @return returned Unclaimed NAVIS freed for other allocations (1e18).
     */
    function cancelCampaign(
        uint256 id
    ) external onlyOwner returns (uint256 returned) {
        require(id < _campaigns.length, "Vesting: invalid campaign id");

        Campaign storage campaign = _campaigns[id];
        require(!campaign.cancelled, "Vesting: campaign was cancelled");

        returned = campaignRemaining(id);
        campaign.cancelled = true;
        campaign.active = false;
        campaign.budget = campaign.claimed;
        campaignReserved -= returned;
        _deallocateRole(campaign.role, returned);

        emit CampaignStatusUpdated(id, false, true);
        emit CampaignCancelled(id, returned);
    }

    /* --------------------------------------------------------------------- */
    /*                           CAMPAIGN CLAIMING                           */
    /* --------------------------------------------------------------------- */

    /**
     * @notice Pay out the allocation of the caller in campaign `id`.
     * @dev    Permissionless: the Merkle proof is the authorisation, and the
     *         tokens can only go to the wallet of the leaf. Each wallet can
     *         claim a campaign once, which keeps the bookkeeping exact.
     * @param  campaignId Campaign to claim from.
     * @param  amount     NAVIS of the allocation (1e18, must match the leaf).
     * @param  proof      Sibling hashes of the leaf in the campaign tree.
     * @return paid       NAVIS transferred to the caller (1e18).
     */
    function claim(
        uint256 campaignId,
        uint256 amount,
        bytes32[] calldata proof
    ) external nonReentrant returns (uint256 paid) {
        paid = _claim(campaignId, msg.sender, amount, proof);
    }

    /**
     * @notice Pay out the allocation of `account` in campaign `id`.
     * @dev    Keeper entry point: a relayer holding {KEEPER_ROLE} can settle a
     *         claim on behalf of a wallet (gasless claim, batch of claims with
     *         the distributor script). It cannot redirect the tokens: they always
     *         go to `account`, which must be the wallet of the leaf.
     * @param  campaignId Campaign to claim from.
     * @param  account    Wallet that owns the allocation.
     * @param  amount     NAVIS of the allocation (1e18, must match the leaf).
     * @param  proof      Sibling hashes of the leaf in the campaign tree.
     * @return paid       NAVIS transferred to `account` (1e18).
     */
    function claimFor(
        uint256 campaignId,
        address account,
        uint256 amount,
        bytes32[] calldata proof
    )
        external
        onlyRole(KEEPER_ROLE)
        nonReentrant
        returns (uint256 paid)
    {
        paid = _claim(campaignId, account, amount, proof);
    }

    /* --------------------------------------------------------------------- */
    /*                                INTERNALS                              */
    /* --------------------------------------------------------------------- */

    /**
     * @dev Shared body of {claim} and {claimFor}: check the campaign window and
     *      status, verify the Merkle proof, book the payout and transfer. The
     *      `claimed` register doubles as the replay guard: a leaf can be used
     *      once, so a campaign can never pay the same wallet twice.
     */
    function _claim(
        uint256 campaignId,
        address account,
        uint256 amount,
        bytes32[] calldata proof
    ) private returns (uint256 paid) {
        require(campaignId < _campaigns.length, "Vesting: invalid campaign id");

        Campaign storage campaign = _campaigns[campaignId];
        require(!campaign.cancelled, "Vesting: campaign was cancelled");
        require(campaign.active, "Vesting: campaign is not active");
        require(account != address(0), "Vesting: receiver is the zero address");
        require(amount > 0, "Vesting: amount must be greater than zero");

        if (campaign.start != 0) {
            require(
                block.timestamp >= uint256(campaign.start),
                "Vesting: campaign has not started"
            );
        }
        if (campaign.end != 0) {
            require(
                block.timestamp <= uint256(campaign.end),
                "Vesting: campaign has ended"
            );
        }

        require(
            _campaignClaimed[campaignId][account] == 0,
            "Vesting: allocation already claimed"
        );
        require(
            campaign.claimed + amount <= campaign.budget,
            "Vesting: amount exceeds the campaign budget"
        );
        require(
            MerkleProof.verify(
                proof,
                campaign.root,
                campaignLeaf(campaignId, account, amount)
            ),
            "Vesting: invalid merkle proof"
        );

        campaign.claimed += amount;
        campaignReserved -= amount;
        _campaignClaimed[campaignId][account] = amount;
        _campaignMembers[campaignId].push(account);
        _roleReleased[_key(campaign.role)] += amount;

        navToken.safeTransfer(account, amount);

        emit CampaignClaimed(campaignId, account, msg.sender, amount);

        paid = amount;
    }

    /**
     * @dev Shared body of {createSchedule} and {createSchedulesBatch}: validate a
     *      request, push the schedule and book the bucket share. Reverts the whole
     *      transaction when the request is not covered by the unallocated balance.
     */
    function _createSchedule(
        address beneficiary,
        string calldata role,
        uint256 total,
        uint64 start,
        uint64 cliffPeriod,
        uint64 vestingPeriod,
        bool revocable
    ) private returns (uint256 id) {
        require(
            beneficiary != address(0),
            "Vesting: beneficiary is the zero address"
        );
        require(total > 0, "Vesting: amount must be greater than zero");
        require(
            vestingPeriod > 0,
            "Vesting: vesting period must be greater than zero"
        );
        require(
            cliffPeriod <= vestingPeriod,
            "Vesting: cliff above the vesting period"
        );
        require(total <= freeBalance(), "Vesting: unallocated balance too low");

        uint64 anchor = start == 0 ? uint64(block.timestamp) : start;

        _schedules.push(
            Schedule({
                beneficiary: beneficiary,
                role: role,
                total: total,
                released: 0,
                start: anchor,
                cliff: cliffPeriod,
                duration: vestingPeriod,
                revocable: revocable,
                revoked: false
            })
        );
        id = _schedules.length - 1;
        _beneficiaryIds[beneficiary].push(id);
        totalAllocated += total;

        if (bytes(role).length > 0) {
            bytes32 key = _key(role);
            if (!_roleDeclared[key]) {
                _roleDeclared[key] = true;
                _roleLabels.push(role);
            }
            _roleAllocated[key] += total;
        }

        emit ScheduleCreated(
            id,
            beneficiary,
            role,
            total,
            anchor,
            cliffPeriod,
            vestingPeriod,
            revocable
        );
    }

    /**
     * @dev Vesting curve of a schedule: linear from `start`, frozen during the
     *      cliff, and frozen for good once the schedule was revoked.
     */
    function _vested(Schedule storage schedule) private view returns (uint256) {
        if (schedule.revoked) {
            return schedule.released;
        }

        uint256 elapsed = block.timestamp > uint256(schedule.start)
            ? block.timestamp - uint256(schedule.start)
            : 0;

        if (elapsed < uint256(schedule.cliff)) {
            return 0;
        }
        if (elapsed >= uint256(schedule.duration)) {
            return schedule.total;
        }
        return (schedule.total * elapsed) / uint256(schedule.duration);
    }

    /// @dev Sum of every declared bucket share, in basis points.
    function _roleShareTotal() private view returns (uint256 total) {
        for (uint256 i = 0; i < _roleLabels.length; i++) {
            total += _roleShareBps[_key(_roleLabels[i])];
        }
    }

    /// @dev Books an allocation against a bucket label, registering it when new.
    function _allocateRole(string memory role, uint256 amount) private {
        if (bytes(role).length == 0 || amount == 0) {
            return;
        }
        bytes32 key = _key(role);
        if (!_roleDeclared[key]) {
            _roleDeclared[key] = true;
            _roleLabels.push(role);
        }
        _roleAllocated[key] += amount;
    }

    /// @dev Releases an allocation back to the pool (cancelled campaign budget).
    function _deallocateRole(string memory role, uint256 amount) private {
        if (bytes(role).length == 0 || amount == 0) {
            return;
        }
        bytes32 key = _key(role);
        uint256 booked = _roleAllocated[key];
        _roleAllocated[key] = booked > amount ? booked - amount : 0;
    }

    /// @dev Hash of a bucket label, used as the key of the role registers.
    function _key(string memory label) private pure returns (bytes32) {
        return keccak256(bytes(label));
    }
}
