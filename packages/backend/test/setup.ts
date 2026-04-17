import { vi } from 'vitest'

// Prevent server from starting during tests
process.env.NODE_ENV = 'test'

// Silence pino logging during tests
process.env.LOG_LEVEL = 'silent'

// Mock environment variables before config module loads
process.env.PORT = '3000'
process.env.RPC_URL = 'http://localhost:8545'
process.env.CONTRACT_ADDRESS = '0x1234567890abcdef1234567890abcdef12345678'
process.env.MINTER_PRIVATE_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
process.env.EXPLORER_BASE_URL = 'https://sepolia.basescan.org'
process.env.FRONTEND_URL = 'http://localhost:5173'

// Mock the blockchain service globally
// Using vi.fn(() => ...) so restoreAllMocks() keeps the factory defaults
vi.mock('../src/services/blockchain.js', () => ({
  awardPoints: vi.fn(),
  registerSurvey: vi.fn(),
  getSurveyInfo: vi.fn(),
  getTotalPoints: vi.fn(),
  getSurveyPoints: vi.fn(),
  hasClaimed: vi.fn(),
  getPointsAwardedEvents: vi.fn(() => Promise.resolve([])),
  getSurveyRegisteredEvents: vi.fn(() => Promise.resolve([])),
  deactivateSurvey: vi.fn(),
  markWalletSubmitted: vi.fn(),
  unmarkWalletSubmitted: vi.fn(),
  isWalletSubmitted: vi.fn(),
  isAdmin: vi.fn(),
  addAdmin: vi.fn(),
  removeAdmin: vi.fn(),
  getAdminAddresses: vi.fn(() => Promise.resolve([])),
  getMinterAddress: vi.fn(() => '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'),
  getMinterBalance: vi.fn(),
  getBlockNumber: vi.fn(),
  getNetwork: vi.fn(),
  provider: {
    getFeeData: vi.fn(() => Promise.resolve({ gasPrice: 1000000n })),
  },
  contract: {},
  readOnlyContract: {},
  queryFilterChunked: vi.fn(),
  validateChainId: vi.fn(() => Promise.resolve()),
}))

// Mock event store with factory pattern (getEventStore returns the mock instance)
const mockEventStore = {
  sync: vi.fn(() => Promise.resolve()),
  getSurveyRegisteredEvents: vi.fn(() => []),
  getPointsAwardedByWallet: vi.fn(() => []),
  getCurrentAdmins: vi.fn(() => []),
  getLastSyncedBlock: vi.fn(() => 1),
  isReady: vi.fn(() => true),
  isStale: vi.fn(() => false),
  start: vi.fn(() => Promise.resolve()),
  stop: vi.fn(),
}

vi.mock('../src/services/event-store.js', () => ({
  getEventStore: vi.fn(() => mockEventStore),
}))
