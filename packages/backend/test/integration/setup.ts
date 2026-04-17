/**
 * Integration test setup — NO mocks.
 *
 * Requires a running Hardhat node with the V2 proxy deployed + seeded:
 *   Terminal 1:  cd packages/contracts && npx hardhat node
 *   Terminal 2:  cd packages/contracts && npx hardhat run scripts/deploy-v2-local.ts --network localhost
 *
 * Hardhat's transaction nonces are deterministic, so deploy-v2-local
 * always produces the same addresses on a fresh node:
 *   - implementation: 0x5FbDB2315678afecb367f032d93F642f64180aa3 (1st deploy)
 *   - proxy:          0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512 (2nd deploy)
 *
 * The backend always talks to the *proxy*, never the implementation.
 */
process.env.NODE_ENV = 'test'
process.env.LOG_LEVEL = 'silent'
process.env.PORT = '0'
process.env.RPC_URL = 'http://127.0.0.1:8545'
process.env.CONTRACT_ADDRESS = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512'
process.env.MINTER_PRIVATE_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
process.env.EXPLORER_BASE_URL = 'http://127.0.0.1:8545'
process.env.FRONTEND_URL = 'http://localhost:5173'

// Wipe persistent state from previous integration runs. Without this,
// the test that registers survey 100 fails on the second local run
// because the HMAC key is still on disk and the on-chain survey is
// already registered. CI runs are always clean, but devs typically
// re-run integration tests several times in a row.
import { rmSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const setupDir = dirname(fileURLToPath(import.meta.url))
const dataDir = join(setupDir, '..', '..', 'data')
for (const file of ['survey-keys.json', 'used-nonces.json', 'events.json']) {
  try {
    rmSync(join(dataDir, file), { force: true })
  } catch {
    // best-effort cleanup
  }
}
