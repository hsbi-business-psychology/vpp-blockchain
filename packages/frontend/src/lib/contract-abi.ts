/**
 * Auto-generated from packages/contracts/artifacts.
 * Do not edit manually — run: pnpm sync-abi
 */
 
export const SURVEY_POINTS_ABI = [
  {
    inputs: [
      {
        internalType: 'address',
        name: 'admin',
        type: 'address',
      },
      {
        internalType: 'address',
        name: 'minter',
        type: 'address',
      },
    ],
    stateMutability: 'nonpayable',
    type: 'constructor',
  },
  {
    inputs: [],
    name: 'AccessControlBadConfirmation',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'account',
        type: 'address',
      },
      {
        internalType: 'bytes32',
        name: 'neededRole',
        type: 'bytes32',
      },
    ],
    name: 'AccessControlUnauthorizedAccount',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'wallet',
        type: 'address',
      },
      {
        internalType: 'uint256',
        name: 'surveyId',
        type: 'uint256',
      },
    ],
    name: 'AlreadyClaimed',
    type: 'error',
  },
  {
    inputs: [],
    name: 'InvalidPoints',
    type: 'error',
  },
  {
    inputs: [],
    name: 'InvalidSecret',
    type: 'error',
  },
  {
    inputs: [],
    name: 'InvalidSurveyId',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'surveyId',
        type: 'uint256',
      },
    ],
    name: 'MaxClaimsReached',
    type: 'error',
  },
  {
    inputs: [],
    name: 'ReentrancyGuardReentrantCall',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'surveyId',
        type: 'uint256',
      },
    ],
    name: 'SurveyAlreadyExists',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'surveyId',
        type: 'uint256',
      },
    ],
    name: 'SurveyNotActive',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'surveyId',
        type: 'uint256',
      },
    ],
    name: 'SurveyNotFound',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'wallet',
        type: 'address',
      },
    ],
    name: 'WalletAlreadySubmitted',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'wallet',
        type: 'address',
      },
    ],
    name: 'WalletNotSubmitted',
    type: 'error',
  },
  {
    inputs: [],
    name: 'ZeroAddress',
    type: 'error',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'address',
        name: 'wallet',
        type: 'address',
      },
      {
        indexed: true,
        internalType: 'uint256',
        name: 'surveyId',
        type: 'uint256',
      },
      {
        indexed: false,
        internalType: 'uint8',
        name: 'points',
        type: 'uint8',
      },
    ],
    name: 'PointsAwarded',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'bytes32',
        name: 'role',
        type: 'bytes32',
      },
      {
        indexed: true,
        internalType: 'bytes32',
        name: 'previousAdminRole',
        type: 'bytes32',
      },
      {
        indexed: true,
        internalType: 'bytes32',
        name: 'newAdminRole',
        type: 'bytes32',
      },
    ],
    name: 'RoleAdminChanged',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'bytes32',
        name: 'role',
        type: 'bytes32',
      },
      {
        indexed: true,
        internalType: 'address',
        name: 'account',
        type: 'address',
      },
      {
        indexed: true,
        internalType: 'address',
        name: 'sender',
        type: 'address',
      },
    ],
    name: 'RoleGranted',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'bytes32',
        name: 'role',
        type: 'bytes32',
      },
      {
        indexed: true,
        internalType: 'address',
        name: 'account',
        type: 'address',
      },
      {
        indexed: true,
        internalType: 'address',
        name: 'sender',
        type: 'address',
      },
    ],
    name: 'RoleRevoked',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'uint256',
        name: 'surveyId',
        type: 'uint256',
      },
    ],
    name: 'SurveyDeactivated',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'uint256',
        name: 'surveyId',
        type: 'uint256',
      },
      {
        indexed: false,
        internalType: 'uint8',
        name: 'points',
        type: 'uint8',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'maxClaims',
        type: 'uint256',
      },
      {
        indexed: false,
        internalType: 'string',
        name: 'title',
        type: 'string',
      },
    ],
    name: 'SurveyRegistered',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'address',
        name: 'wallet',
        type: 'address',
      },
      {
        indexed: true,
        internalType: 'address',
        name: 'markedBy',
        type: 'address',
      },
    ],
    name: 'WalletSubmitted',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'address',
        name: 'wallet',
        type: 'address',
      },
      {
        indexed: true,
        internalType: 'address',
        name: 'unmarkedBy',
        type: 'address',
      },
    ],
    name: 'WalletUnsubmitted',
    type: 'event',
  },
  {
    inputs: [],
    name: 'ADMIN_ROLE',
    outputs: [
      {
        internalType: 'bytes32',
        name: '',
        type: 'bytes32',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'DEFAULT_ADMIN_ROLE',
    outputs: [
      {
        internalType: 'bytes32',
        name: '',
        type: 'bytes32',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'MINTER_ROLE',
    outputs: [
      {
        internalType: 'bytes32',
        name: '',
        type: 'bytes32',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'account',
        type: 'address',
      },
    ],
    name: 'addAdmin',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'student',
        type: 'address',
      },
      {
        internalType: 'uint256',
        name: 'surveyId',
        type: 'uint256',
      },
      {
        internalType: 'string',
        name: 'secret',
        type: 'string',
      },
    ],
    name: 'awardPoints',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'wallet',
        type: 'address',
      },
      {
        internalType: 'uint256',
        name: 'surveyId',
        type: 'uint256',
      },
    ],
    name: 'claimed',
    outputs: [
      {
        internalType: 'bool',
        name: '',
        type: 'bool',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'surveyId',
        type: 'uint256',
      },
    ],
    name: 'deactivateSurvey',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'bytes32',
        name: 'role',
        type: 'bytes32',
      },
    ],
    name: 'getRoleAdmin',
    outputs: [
      {
        internalType: 'bytes32',
        name: '',
        type: 'bytes32',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'surveyId',
        type: 'uint256',
      },
    ],
    name: 'getSurveyInfo',
    outputs: [
      {
        internalType: 'bytes32',
        name: 'secretHash',
        type: 'bytes32',
      },
      {
        internalType: 'uint8',
        name: 'points',
        type: 'uint8',
      },
      {
        internalType: 'uint256',
        name: 'maxClaims',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: 'claimCount',
        type: 'uint256',
      },
      {
        internalType: 'bool',
        name: 'active',
        type: 'bool',
      },
      {
        internalType: 'uint256',
        name: 'registeredAt',
        type: 'uint256',
      },
      {
        internalType: 'string',
        name: 'title',
        type: 'string',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'bytes32',
        name: 'role',
        type: 'bytes32',
      },
      {
        internalType: 'address',
        name: 'account',
        type: 'address',
      },
    ],
    name: 'grantRole',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'bytes32',
        name: 'role',
        type: 'bytes32',
      },
      {
        internalType: 'address',
        name: 'account',
        type: 'address',
      },
    ],
    name: 'hasRole',
    outputs: [
      {
        internalType: 'bool',
        name: '',
        type: 'bool',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'account',
        type: 'address',
      },
    ],
    name: 'isAdmin',
    outputs: [
      {
        internalType: 'bool',
        name: '',
        type: 'bool',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'wallet',
        type: 'address',
      },
    ],
    name: 'isWalletSubmitted',
    outputs: [
      {
        internalType: 'bool',
        name: '',
        type: 'bool',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'wallet',
        type: 'address',
      },
    ],
    name: 'markWalletSubmitted',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'surveyId',
        type: 'uint256',
      },
      {
        internalType: 'bytes32',
        name: 'secretHash',
        type: 'bytes32',
      },
      {
        internalType: 'uint8',
        name: 'points',
        type: 'uint8',
      },
      {
        internalType: 'uint256',
        name: 'maxClaims',
        type: 'uint256',
      },
      {
        internalType: 'string',
        name: 'title',
        type: 'string',
      },
    ],
    name: 'registerSurvey',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'account',
        type: 'address',
      },
    ],
    name: 'removeAdmin',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'bytes32',
        name: 'role',
        type: 'bytes32',
      },
      {
        internalType: 'address',
        name: 'callerConfirmation',
        type: 'address',
      },
    ],
    name: 'renounceRole',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'bytes32',
        name: 'role',
        type: 'bytes32',
      },
      {
        internalType: 'address',
        name: 'account',
        type: 'address',
      },
    ],
    name: 'revokeRole',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'bytes4',
        name: 'interfaceId',
        type: 'bytes4',
      },
    ],
    name: 'supportsInterface',
    outputs: [
      {
        internalType: 'bool',
        name: '',
        type: 'bool',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'wallet',
        type: 'address',
      },
      {
        internalType: 'uint256',
        name: 'surveyId',
        type: 'uint256',
      },
    ],
    name: 'surveyPoints',
    outputs: [
      {
        internalType: 'uint8',
        name: '',
        type: 'uint8',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'wallet',
        type: 'address',
      },
    ],
    name: 'totalPoints',
    outputs: [
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'wallet',
        type: 'address',
      },
    ],
    name: 'unmarkWalletSubmitted',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const satisfies readonly any[]
