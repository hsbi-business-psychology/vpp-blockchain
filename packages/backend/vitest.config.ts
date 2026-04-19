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
 * The numbers below were chosen as a "floor below today's measured
 * coverage" so this commit can land without an immediate green→red
 * flip while still blocking any future drop. Baseline measured on
 * 2026-04-19 with 196 specs across 17 files:
 *
 *   statements: 59.78 %  -> floor 55 %
 *   branches:   82.45 %  -> floor 75 %
 *   functions:  91.78 %  -> floor 85 %
 *   lines:      59.78 %  -> floor 55 %
 *
 * The aspirational target from audit Bereich 8 (85/80/85/85) is
 * deliberately NOT enforced today — the global statement/line
 * percentage is dragged down by intentionally-mock-heavy modules
 * (`blockchain.ts`, `event-store.ts`, `json-file-event-store.ts`)
 * whose real coverage lives in their consumers. Cleaning that up
 * is a long-term backlog item; the floor here is the mechanism
 * that keeps the next refactor honest.
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
        statements: 55,
        branches: 75,
        functions: 85,
        lines: 55,
      },
    },
  },
})
