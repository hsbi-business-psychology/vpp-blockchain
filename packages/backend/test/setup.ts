import { vi } from 'vitest'

// Prevent server from starting during tests
process.env.NODE_ENV = 'test'

// Mock environment variables before config module loads
process.env.PORT = '3000'
process.env.RPC_URL = 'http://localhost:8545'
process.env.CONTRACT_ADDRESS = '0x1234567890abcdef1234567890abcdef12345678'
process.env.MINTER_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
process.env.ADMIN_WALLETS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
process.env.EXPLORER_BASE_URL = 'https://sepolia.basescan.org'
process.env.FRONTEND_URL = 'http://localhost:5173'

// Mock the blockchain service globally
vi.mock('../src/services/blockchain.js', () => ({
  awardPoints: vi.fn(),
  registerSurvey: vi.fn(),
  getSurveyInfo: vi.fn(),
  getTotalPoints: vi.fn(),
  getSurveyPoints: vi.fn(),
  hasClaimed: vi.fn(),
  getPointsAwardedEvents: vi.fn(),
  getSurveyRegisteredEvents: vi.fn(),
  deactivateSurvey: vi.fn(),
  markWalletSubmitted: vi.fn(),
  unmarkWalletSubmitted: vi.fn(),
  isWalletSubmitted: vi.fn(),
  isAdmin: vi.fn(),
  getBlockNumber: vi.fn(),
  getNetwork: vi.fn(),
  provider: {},
  contract: {},
  readOnlyContract: {},
}))
