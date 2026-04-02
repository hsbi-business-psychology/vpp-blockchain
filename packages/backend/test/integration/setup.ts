/**
 * Integration test setup — NO mocks.
 *
 * Requires a running Hardhat node with the contract deployed:
 *   Terminal 1:  cd packages/contracts && npx hardhat node
 *   Terminal 2:  cd packages/contracts && npx hardhat run scripts/deploy-local.ts --network localhost
 *
 * The default Hardhat first-deploy address is deterministic.
 */
process.env.NODE_ENV = 'test'
process.env.LOG_LEVEL = 'silent'
process.env.PORT = '0'
process.env.RPC_URL = 'http://127.0.0.1:8545'
process.env.CONTRACT_ADDRESS = '0x5FbDB2315678afecb367f032d93F642f64180aa3'
process.env.MINTER_PRIVATE_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
process.env.EXPLORER_BASE_URL = 'http://127.0.0.1:8545'
process.env.FRONTEND_URL = 'http://localhost:5173'
