// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
// ReentrancyGuardUpgradeable was removed in @openzeppelin/contracts-upgradeable v5.5+.
// We use the transient-storage variant (EIP-1153, available on Base since the
// Cancun fork in March 2024). It is stateless, has no constructor, and is
// therefore safe — and recommended — for inheritance by upgradeable proxies.
import "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";

/// @title SurveyPointsV2
/// @notice Tamper-proof survey participation points for the Verifiable
///         Participant Points (VPP) system.
///
/// V2 highlights compared to V1:
///   * UUPS upgradeable proxy: bug-fix releases without redeployment,
///     no migration of state required.
///   * Claim secrets are removed entirely. The smart contract trusts the
///     MINTER_ROLE to enforce one-time-use proofs off-chain (HMAC-signed
///     tokens minted by SoSci/LimeSurvey, replay-protected in the backend
///     nonce store). Plain-text secrets never touch the chain again.
///   * `revokePoints` allows admins to undo a mistakenly granted award —
///     V1 had no recovery path beyond redeploying the whole contract.
///   * `reactivateSurvey` un-deactivates a survey when needed.
///   * `addAdmin` / `removeAdmin` enforce a minimum of one ADMIN_ROLE
///     holder so a self-revoke can never lock the project out.
///   * No `secretHash` field; storage layout is therefore *not* a
///     drop-in extension of V1 — V2 is a clean redeploy.
contract SurveyPointsV2 is
    Initializable,
    AccessControlUpgradeable,
    ReentrancyGuardTransient,
    UUPSUpgradeable
{
    // ---------------------------------------------------------------
    //  Roles
    // ---------------------------------------------------------------

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    // ---------------------------------------------------------------
    //  Data structures
    // ---------------------------------------------------------------

    struct Survey {
        uint8 points;
        uint256 maxClaims;
        uint256 claimCount;
        bool active;
        uint256 registeredAt;
        string title;
    }

    // ---------------------------------------------------------------
    //  State
    // ---------------------------------------------------------------

    mapping(uint256 => Survey) private _surveys;
    mapping(address => mapping(uint256 => uint8)) private _surveyPoints;
    mapping(address => uint256) private _totalPoints;
    mapping(address => mapping(uint256 => bool)) private _claimed;
    mapping(address => bool) private _walletSubmitted;

    /// @dev Number of accounts holding ADMIN_ROLE. Tracked here to
    ///      enforce the "never remove the last admin" invariant in O(1).
    uint256 private _adminCount;

    /// @dev Reserved storage slots for future upgrades. Whenever new
    ///      state variables are added in V3+, decrement this gap by the
    ///      same amount. Failing to do so corrupts proxy storage.
    uint256[40] private __gap;

    // ---------------------------------------------------------------
    //  Events
    // ---------------------------------------------------------------

    event SurveyRegistered(
        uint256 indexed surveyId,
        uint8 points,
        uint256 maxClaims,
        string title
    );

    event PointsAwarded(
        address indexed wallet,
        uint256 indexed surveyId,
        uint8 points
    );

    event PointsRevoked(
        address indexed wallet,
        uint256 indexed surveyId,
        uint8 points,
        address indexed revokedBy
    );

    event SurveyDeactivated(uint256 indexed surveyId);
    event SurveyReactivated(uint256 indexed surveyId);

    event WalletSubmitted(address indexed wallet, address indexed markedBy);
    event WalletUnsubmitted(address indexed wallet, address indexed unmarkedBy);

    // ---------------------------------------------------------------
    //  Errors
    // ---------------------------------------------------------------

    error SurveyAlreadyExists(uint256 surveyId);
    error SurveyNotFound(uint256 surveyId);
    error SurveyNotActive(uint256 surveyId);
    error SurveyAlreadyActive(uint256 surveyId);
    error AlreadyClaimed(address wallet, uint256 surveyId);
    error NotClaimed(address wallet, uint256 surveyId);
    error MaxClaimsReached(uint256 surveyId);
    error InvalidPoints();
    error InvalidSurveyId();
    error ZeroAddress();
    error WalletAlreadySubmitted(address wallet);
    error WalletNotSubmitted(address wallet);
    error LastAdmin();

    // ---------------------------------------------------------------
    //  Initializer / upgrade authorisation
    // ---------------------------------------------------------------

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @notice Proxy initializer. Replaces the constructor for the proxy.
    /// @param admin  Wallet receiving DEFAULT_ADMIN_ROLE + ADMIN_ROLE.
    /// @param minter Wallet receiving MINTER_ROLE (typically the backend).
    function initialize(address admin, address minter) public initializer {
        if (admin == address(0) || minter == address(0)) revert ZeroAddress();

        __AccessControl_init();
        // UUPSUpgradeable is stateless in @openzeppelin/contracts-upgradeable v5.x —
        // no initializer is required.

        _setRoleAdmin(ADMIN_ROLE, ADMIN_ROLE);
        _setRoleAdmin(MINTER_ROLE, ADMIN_ROLE);

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
        // It is common for the deploying admin to also fulfil the minter
        // duty in tests / dev. _grantRole keeps the bookkeeping correct
        // even if admin == minter.
        _grantRole(MINTER_ROLE, minter);
    }

    /// @dev Only the DEFAULT_ADMIN_ROLE may upgrade the implementation.
    ///      DEFAULT_ADMIN_ROLE is intentionally separate from ADMIN_ROLE
    ///      so that day-to-day admin operations (registering surveys,
    ///      adding helpers) cannot be used to swap out the contract code.
    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyRole(DEFAULT_ADMIN_ROLE)
    {}

    /// @notice Semantic version string. Bump on every upgrade so off-chain
    ///         tooling can detect which implementation is currently active.
    function version() external pure returns (string memory) {
        return "2.0.0";
    }

    // ---------------------------------------------------------------
    //  Survey lifecycle
    // ---------------------------------------------------------------

    /// @notice Register a new survey. Secrets are *not* stored on-chain
    ///         in V2 — proof of completion is delegated to the backend's
    ///         HMAC-signed token mechanism.
    function registerSurvey(
        uint256 surveyId,
        uint8 points,
        uint256 maxClaims,
        string calldata title
    ) external onlyRole(ADMIN_ROLE) {
        if (surveyId == 0) revert InvalidSurveyId();
        if (points == 0) revert InvalidPoints();
        if (_surveys[surveyId].points != 0) revert SurveyAlreadyExists(surveyId);

        _surveys[surveyId] = Survey({
            points: points,
            maxClaims: maxClaims,
            claimCount: 0,
            active: true,
            registeredAt: block.timestamp,
            title: title
        });

        emit SurveyRegistered(surveyId, points, maxClaims, title);
    }

    /// @notice Award points to a student. The Minter is expected to have
    ///         already verified an off-chain HMAC token before calling.
    function awardPoints(address student, uint256 surveyId)
        external
        onlyRole(MINTER_ROLE)
        nonReentrant
    {
        if (student == address(0)) revert ZeroAddress();

        Survey storage survey = _surveys[surveyId];
        if (survey.points == 0) revert SurveyNotFound(surveyId);
        if (!survey.active) revert SurveyNotActive(surveyId);
        if (_claimed[student][surveyId]) revert AlreadyClaimed(student, surveyId);
        if (survey.maxClaims > 0 && survey.claimCount >= survey.maxClaims)
            revert MaxClaimsReached(surveyId);

        _claimed[student][surveyId] = true;
        _surveyPoints[student][surveyId] = survey.points;
        _totalPoints[student] += survey.points;
        survey.claimCount += 1;

        emit PointsAwarded(student, surveyId, survey.points);
    }

    /// @notice Reverse a previously awarded claim. Used to correct genuine
    ///         mistakes (operator error, accidentally awarded twice via
    ///         backend bug, etc.). Total points are decremented and the
    ///         claim flag is cleared so the wallet can re-claim if needed.
    function revokePoints(address student, uint256 surveyId)
        external
        onlyRole(ADMIN_ROLE)
    {
        if (!_claimed[student][surveyId]) revert NotClaimed(student, surveyId);

        uint8 points = _surveyPoints[student][surveyId];
        _claimed[student][surveyId] = false;
        _surveyPoints[student][surveyId] = 0;
        _totalPoints[student] -= points;
        _surveys[surveyId].claimCount -= 1;

        emit PointsRevoked(student, surveyId, points, msg.sender);
    }

    /// @notice Stop accepting new claims for a survey (existing claims
    ///         remain valid).
    function deactivateSurvey(uint256 surveyId) external onlyRole(ADMIN_ROLE) {
        Survey storage survey = _surveys[surveyId];
        if (survey.points == 0) revert SurveyNotFound(surveyId);
        if (!survey.active) revert SurveyNotActive(surveyId);

        survey.active = false;
        emit SurveyDeactivated(surveyId);
    }

    /// @notice Re-enable a previously deactivated survey.
    function reactivateSurvey(uint256 surveyId) external onlyRole(ADMIN_ROLE) {
        Survey storage survey = _surveys[surveyId];
        if (survey.points == 0) revert SurveyNotFound(surveyId);
        if (survey.active) revert SurveyAlreadyActive(surveyId);

        survey.active = true;
        emit SurveyReactivated(surveyId);
    }

    // ---------------------------------------------------------------
    //  Admin role management with min-1 invariant
    // ---------------------------------------------------------------

    function addAdmin(address account) external onlyRole(ADMIN_ROLE) {
        if (account == address(0)) revert ZeroAddress();
        // Idempotent: granting an already-held role is a no-op rather
        // than a revert. Saves frontends from extra has-role checks.
        if (!hasRole(ADMIN_ROLE, account)) {
            _grantRole(ADMIN_ROLE, account);
        }
    }

    function removeAdmin(address account) external onlyRole(ADMIN_ROLE) {
        if (account == address(0)) revert ZeroAddress();
        if (hasRole(ADMIN_ROLE, account)) {
            // Refuse to revoke the last admin so the contract can never
            // become orphaned. The DEFAULT_ADMIN_ROLE could still recover
            // via grantRole, but only if an external operator still holds
            // it — better to fail loudly than to risk lockout.
            if (_adminCount <= 1) revert LastAdmin();
            _revokeRole(ADMIN_ROLE, account);
        }
    }

    /// @notice Convenience read — number of accounts currently holding
    ///         ADMIN_ROLE. Mirrors the on-chain invariant enforced by
    ///         `removeAdmin`.
    function adminCount() external view returns (uint256) {
        return _adminCount;
    }

    /// @dev Maintain the admin counter. We override the low-level
    ///      `_grantRole` / `_revokeRole` rather than the public functions
    ///      so the bookkeeping is correct regardless of which entry point
    ///      mutates the role (initializer, addAdmin, grantRole, …).
    function _grantRole(bytes32 role, address account)
        internal
        override
        returns (bool)
    {
        bool granted = super._grantRole(role, account);
        if (granted && role == ADMIN_ROLE) {
            _adminCount += 1;
        }
        return granted;
    }

    function _revokeRole(bytes32 role, address account)
        internal
        override
        returns (bool)
    {
        bool revoked = super._revokeRole(role, account);
        if (revoked && role == ADMIN_ROLE) {
            _adminCount -= 1;
        }
        return revoked;
    }

    // ---------------------------------------------------------------
    //  Wallet submission tracking (unchanged from V1)
    // ---------------------------------------------------------------

    function markWalletSubmitted(address wallet) external onlyRole(ADMIN_ROLE) {
        if (wallet == address(0)) revert ZeroAddress();
        if (_walletSubmitted[wallet]) revert WalletAlreadySubmitted(wallet);

        _walletSubmitted[wallet] = true;
        emit WalletSubmitted(wallet, msg.sender);
    }

    function unmarkWalletSubmitted(address wallet) external onlyRole(ADMIN_ROLE) {
        if (wallet == address(0)) revert ZeroAddress();
        if (!_walletSubmitted[wallet]) revert WalletNotSubmitted(wallet);

        _walletSubmitted[wallet] = false;
        emit WalletUnsubmitted(wallet, msg.sender);
    }

    // ---------------------------------------------------------------
    //  Read functions
    // ---------------------------------------------------------------

    function isWalletSubmitted(address wallet) external view returns (bool) {
        return _walletSubmitted[wallet];
    }

    function isAdmin(address account) external view returns (bool) {
        return hasRole(ADMIN_ROLE, account);
    }

    function totalPoints(address wallet) external view returns (uint256) {
        return _totalPoints[wallet];
    }

    function surveyPoints(address wallet, uint256 surveyId)
        external
        view
        returns (uint8)
    {
        return _surveyPoints[wallet][surveyId];
    }

    function claimed(address wallet, uint256 surveyId)
        external
        view
        returns (bool)
    {
        return _claimed[wallet][surveyId];
    }

    /// @notice Full survey details. Note: V2 returns *no* secret hash —
    ///         callers from V1 will need to update the destructuring tuple.
    function getSurveyInfo(uint256 surveyId)
        external
        view
        returns (
            uint8 points,
            uint256 maxClaims,
            uint256 claimCount,
            bool active,
            uint256 registeredAt,
            string memory title
        )
    {
        Survey storage survey = _surveys[surveyId];
        return (
            survey.points,
            survey.maxClaims,
            survey.claimCount,
            survey.active,
            survey.registeredAt,
            survey.title
        );
    }
}
