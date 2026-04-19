import { defineConfig } from 'vitest/config'

/**
 * Backend Vitest config.
 *
 * Coverage thresholds (audit M15 / F8.1).
 *
 * Until M15 the backend ran `vitest run --coverage` purely for the
 * Codecov upload but had ZERO enforced thresholds — every other
 * coverage knob in the repo (frontend, contracts) was already wired
 * to fail-closed on regression, but the backend produced reports
 * nobody read. A future PR could have deleted the entire
 * `test/hmac.test.ts` suite (16 tests) and CI would still have been
 * green.
 *
 * The thresholds are set as floors a few points below the measured
 * coverage so a normal-sized refactor can land without immediately
 * flipping CI red, while still blocking any meaningful regression.
 *
 * 2026-04-19 (initial floor, M15):  196 specs, 17 files
 *   statements: 59.78 %  -> floor 55 %
 *   branches:   82.45 %  -> floor 75 %
 *   functions:  91.78 %  -> floor 85 %
 *   lines:      59.78 %  -> floor 55 %
 *
 * 2026-04-19 (post test-gap closure):  313 specs, 22 files
 *   statements: 78.15 %  -> floor 75 %
 *   branches:   85.94 %  -> floor 82 %
 *   functions:  94.62 %  -> floor 92 %
 *   lines:      78.15 %  -> floor 75 %
 *
 * After this pass the only large coverage hole left is `blockchain.ts`
 * (0 %, 609 lines). Its routes ARE covered end-to-end via the global
 * vi.mock in test/setup.ts but the unit module itself is intentionally
 * skipped — meaningful unit tests for ethers wrappers would mock away
 * everything they're supposed to verify. Closing the last 22 % would
 * require an integration suite against a live Hardhat fork; deferred
 * to the post-Q3/2026 roadmap.
 *
 * Excluded from coverage: type-only modules (no executable code),
 * the integration suite (lives in its own config), and generated
 * artifacts.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    exclude: ['test/integration/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.types.ts', 'src/**/types.ts', 'src/**/*.interface.ts', 'src/**/index.ts'],
      thresholds: {
        statements: 75,
        branches: 82,
        functions: 92,
        lines: 75,
      },
    },
  },
})
