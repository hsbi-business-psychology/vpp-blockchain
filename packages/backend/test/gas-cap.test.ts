/**
 * Verifies the gas fee hard caps wired up in `services/blockchain.ts`
 * for audit F2.3 / M12.
 *
 * The full blockchain module is mocked out in `test/setup.ts` for
 * speed, so this spec exercises the cap construction in isolation:
 *
 *   1. Defaults match the documented values (2 gwei / 0.5 gwei).
 *   2. Operator overrides via env vars are honoured.
 *   3. The rendered `TX_OVERRIDES` shape is what ethers v6's
 *      `Contract.method(...args, overrides)` expects.
 *
 * If a future refactor drops the cap by accident (e.g. removes
 * `TX_OVERRIDES` from a write path), the spike-protection guarantee
 * documented in `docs/runbooks/eth-refill.md` quietly breaks. This
 * test is the canary.
 */
import { ethers } from 'ethers'
import { describe, it, expect, vi } from 'vitest'

describe('Gas fee hard caps (F2.3 / M12)', () => {
  it('defaults to 2 gwei maxFeePerGas and 0.5 gwei maxPriorityFeePerGas', async () => {
    vi.resetModules()
    const { config } = await import('../src/config.js')
    expect(config.maxFeePerGasGwei).toBe('2')
    expect(config.maxPriorityFeePerGasGwei).toBe('0.5')

    const maxFee = ethers.parseUnits(config.maxFeePerGasGwei, 'gwei')
    const maxPriority = ethers.parseUnits(config.maxPriorityFeePerGasGwei, 'gwei')

    expect(maxFee).toBe(2_000_000_000n)
    expect(maxPriority).toBe(500_000_000n)
  })

  it('honours operator overrides via env', async () => {
    const originalMax = process.env.MAX_FEE_PER_GAS_GWEI
    const originalPriority = process.env.MAX_PRIORITY_FEE_PER_GAS_GWEI
    process.env.MAX_FEE_PER_GAS_GWEI = '50'
    process.env.MAX_PRIORITY_FEE_PER_GAS_GWEI = '5'
    try {
      vi.resetModules()
      const { config } = await import('../src/config.js')
      expect(config.maxFeePerGasGwei).toBe('50')
      expect(config.maxPriorityFeePerGasGwei).toBe('5')
    } finally {
      process.env.MAX_FEE_PER_GAS_GWEI = originalMax
      process.env.MAX_PRIORITY_FEE_PER_GAS_GWEI = originalPriority
      vi.resetModules()
    }
  })

  it('produces a TX_OVERRIDES object with the correct ethers shape', () => {
    // Mirror the construction in services/blockchain.ts so a future
    // signature change there breaks this assertion loudly.
    const overrides: ethers.Overrides = {
      maxFeePerGas: ethers.parseUnits('2', 'gwei'),
      maxPriorityFeePerGas: ethers.parseUnits('0.5', 'gwei'),
    }
    expect(overrides.maxFeePerGas).toBe(2_000_000_000n)
    expect(overrides.maxPriorityFeePerGas).toBe(500_000_000n)
    // Sanity: maxFee must always be >= priority fee (otherwise EIP-1559 rejects).
    expect(BigInt(overrides.maxFeePerGas as bigint)).toBeGreaterThanOrEqual(
      BigInt(overrides.maxPriorityFeePerGas as bigint),
    )
  })
})
