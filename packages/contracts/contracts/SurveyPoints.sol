// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title SurveyPoints
/// @notice Manages survey registration and tamper-proof point distribution for
///         the Verifiable Participant Points (VPP) system.
/// @dev Points are stored in simple mappings rather than token standards to
///      minimise gas costs (~75 % cheaper than ERC-721).
contract SurveyPoints is AccessControl, ReentrancyGuard {
    // ---------------------------------------------------------------
    //  Roles
    // ---------------------------------------------------------------

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    // ---------------------------------------------------------------
    //  Data structures
    // ---------------------------------------------------------------

    struct Survey {
        bytes32 secretHash;
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

    event SurveyDeactivated(uint256 indexed surveyId);

    event WalletSubmitted(address indexed wallet, address indexed markedBy);
    event WalletUnsubmitted(address indexed wallet, address indexed unmarkedBy);

    // ---------------------------------------------------------------
    //  Errors
    // ---------------------------------------------------------------

    error SurveyAlreadyExists(uint256 surveyId);
    error SurveyNotFound(uint256 surveyId);
    error SurveyNotActive(uint256 surveyId);
    error InvalidSecret();
    error AlreadyClaimed(address wallet, uint256 surveyId);
    error MaxClaimsReached(uint256 surveyId);
    error InvalidPoints();
    error InvalidSurveyId();
    error ZeroAddress();
    error WalletAlreadySubmitted(address wallet);
    error WalletNotSubmitted(address wallet);

    // ---------------------------------------------------------------
    //  Constructor
    // ---------------------------------------------------------------

    /// @param admin  Address that receives DEFAULT_ADMIN_ROLE and ADMIN_ROLE.
    /// @param minter Address that receives MINTER_ROLE (typically the backend).
    constructor(address admin, address minter) {
        if (admin == address(0) || minter == address(0)) revert ZeroAddress();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, minter);

        _setRoleAdmin(ADMIN_ROLE, ADMIN_ROLE);
        _setRoleAdmin(MINTER_ROLE, ADMIN_ROLE);
    }

    // ---------------------------------------------------------------
    //  Write functions
    // ---------------------------------------------------------------

    /// @notice Register a new survey.
    /// @param surveyId   Unique identifier for the survey.
    /// @param secretHash keccak256 hash of the survey secret.
    /// @param points     Points awarded per claim (1–255).
    /// @param maxClaims  Maximum number of claims (0 = unlimited).
    /// @param title      Human-readable survey title.
    function registerSurvey(
        uint256 surveyId,
        bytes32 secretHash,
        uint8 points,
        uint256 maxClaims,
        string calldata title
    ) external onlyRole(ADMIN_ROLE) {
        if (surveyId == 0) revert InvalidSurveyId();
        if (points == 0) revert InvalidPoints();
        if (_surveys[surveyId].points != 0) revert SurveyAlreadyExists(surveyId);

        _surveys[surveyId] = Survey({
            secretHash: secretHash,
            points: points,
            maxClaims: maxClaims,
            claimCount: 0,
            active: true,
            registeredAt: block.timestamp,
            title: title
        });

        emit SurveyRegistered(surveyId, points, maxClaims, title);
    }

    /// @notice Award points to a student for completing a survey.
    /// @param student  Wallet address of the student.
    /// @param surveyId ID of the survey being claimed.
    /// @param secret   Plain-text secret (verified against the on-chain hash).
    function awardPoints(
        address student,
        uint256 surveyId,
        string calldata secret
    ) external onlyRole(MINTER_ROLE) nonReentrant {
        if (student == address(0)) revert ZeroAddress();

        Survey storage survey = _surveys[surveyId];
        if (survey.points == 0) revert SurveyNotFound(surveyId);
        if (!survey.active) revert SurveyNotActive(surveyId);
        if (_claimed[student][surveyId]) revert AlreadyClaimed(student, surveyId);
        if (keccak256(abi.encodePacked(secret)) != survey.secretHash)
            revert InvalidSecret();
        if (survey.maxClaims > 0 && survey.claimCount >= survey.maxClaims)
            revert MaxClaimsReached(surveyId);

        _claimed[student][surveyId] = true;
        _surveyPoints[student][surveyId] = survey.points;
        _totalPoints[student] += survey.points;
        survey.claimCount += 1;

        emit PointsAwarded(student, surveyId, survey.points);
    }

    /// @notice Deactivate a survey so no further claims are accepted.
    /// @param surveyId ID of the survey to deactivate.
    function deactivateSurvey(
        uint256 surveyId
    ) external onlyRole(ADMIN_ROLE) {
        Survey storage survey = _surveys[surveyId];
        if (survey.points == 0) revert SurveyNotFound(surveyId);
        if (!survey.active) revert SurveyNotActive(surveyId);

        survey.active = false;

        emit SurveyDeactivated(surveyId);
    }

    // ---------------------------------------------------------------
    //  Admin role management
    // ---------------------------------------------------------------

    /// @notice Grant ADMIN_ROLE to another address.
    function addAdmin(address account) external onlyRole(ADMIN_ROLE) {
        if (account == address(0)) revert ZeroAddress();
        grantRole(ADMIN_ROLE, account);
    }

    /// @notice Revoke ADMIN_ROLE from an address.
    function removeAdmin(address account) external onlyRole(ADMIN_ROLE) {
        if (account == address(0)) revert ZeroAddress();
        revokeRole(ADMIN_ROLE, account);
    }

    // ---------------------------------------------------------------
    //  Wallet submission tracking
    // ---------------------------------------------------------------

    /// @notice Mark a student wallet as having submitted their points for
    ///         thesis admission. Prevents the same wallet from being used
    ///         by multiple students.
    function markWalletSubmitted(address wallet) external onlyRole(ADMIN_ROLE) {
        if (wallet == address(0)) revert ZeroAddress();
        if (_walletSubmitted[wallet]) revert WalletAlreadySubmitted(wallet);

        _walletSubmitted[wallet] = true;

        emit WalletSubmitted(wallet, msg.sender);
    }

    /// @notice Remove the submission mark from a wallet (e.g. to correct
    ///         a mistake).
    function unmarkWalletSubmitted(address wallet) external onlyRole(ADMIN_ROLE) {
        if (wallet == address(0)) revert ZeroAddress();
        if (!_walletSubmitted[wallet]) revert WalletNotSubmitted(wallet);

        _walletSubmitted[wallet] = false;

        emit WalletUnsubmitted(wallet, msg.sender);
    }

    // ---------------------------------------------------------------
    //  Read functions
    // ---------------------------------------------------------------

    /// @notice Check whether a wallet has been marked as submitted.
    function isWalletSubmitted(address wallet) external view returns (bool) {
        return _walletSubmitted[wallet];
    }

    /// @notice Check whether an address has ADMIN_ROLE.
    function isAdmin(address account) external view returns (bool) {
        return hasRole(ADMIN_ROLE, account);
    }

    /// @notice Get the total points accumulated by a wallet.
    function totalPoints(address wallet) external view returns (uint256) {
        return _totalPoints[wallet];
    }

    /// @notice Get the points a wallet earned for a specific survey.
    function surveyPoints(
        address wallet,
        uint256 surveyId
    ) external view returns (uint8) {
        return _surveyPoints[wallet][surveyId];
    }

    /// @notice Check whether a wallet has already claimed a survey.
    function claimed(
        address wallet,
        uint256 surveyId
    ) external view returns (bool) {
        return _claimed[wallet][surveyId];
    }

    /// @notice Get full details of a registered survey.
    function getSurveyInfo(
        uint256 surveyId
    )
        external
        view
        returns (
            bytes32 secretHash,
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
            survey.secretHash,
            survey.points,
            survey.maxClaims,
            survey.claimCount,
            survey.active,
            survey.registeredAt,
            survey.title
        );
    }
}
