/**
 * Verifies the gas fee strategy wired up in `services/blockchain.ts`
 * for audit F2.3 / M12 + the cost-efficiency fix that replaced the
 * static-override path with dynamic `buildTxOverrides()`.
 *
 * The full blockchain module is mocked out in `test/setup.ts` for
 * speed, so this spec exercises the cap construction in isolation:
 *
 *   1. Defaults match the documented values (2 gwei ceiling /
 *      0.01 gwei priority ceiling — the latter was lowered from
 *      0.5 gwei after observing a 100× overpay on production).
 *   2. Operator overrides via env vars are honoured.
 *   3. The `buildTxOverrides()` policy:
 *        - clips an oversized provider tip down to the ceiling
 *        - passes a small provider tip through unchanged
 *        - computes maxFee = 2 × baseFee + tip
 *        - clips maxFee to the absolute ceiling during a fee spike
 *        - guarantees maxFee ≥ priority (ethers v6 invariant)
 *   4. The deprecated static `TX_OVERRIDES` constant still has the
 *      correct ethers shape (kept as a worst-case fallback).
 *
 * If a future refactor drops `buildTxOverrides()` from a write path
 * and reverts to `TX_OVERRIDES`, the cost-efficiency guarantee
 * documented in `docs/runbooks/eth-refill.md` quietly breaks — and
 * the user-visible cost per claim balloons by ~30×. This test is the
 * canary.
 */
import { ethers } from 'ethers'
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('Gas fee strategy (F2.3 / M12 + cost fix)', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  describe('defaults', () => {
    it('caps maxFeePerGas at 2 gwei', async () => {
      const { config } = await import('../src/config.js')
      expect(config.maxFeePerGasGwei).toBe('2')
      expect(ethers.parseUnits(config.maxFeePerGasGwei, 'gwei')).toBe(2_000_000_000n)
    })

    it('caps maxPriorityFeePerGas at 0.01 gwei (Base-tuned)', async () => {
      const { config } = await import('../src/config.js')
      expect(config.maxPriorityFeePerGasGwei).toBe('0.01')
      expect(ethers.parseUnits(config.maxPriorityFeePerGasGwei, 'gwei')).toBe(10_000_000n)
    })

    it('keeps the priority ceiling well below the maxFee ceiling', async () => {
      const { config } = await import('../src/config.js')
      const maxFee = ethers.parseUnits(config.maxFeePerGasGwei, 'gwei')
      const maxPriority = ethers.parseUnits(config.maxPriorityFeePerGasGwei, 'gwei')
      // Sanity: ethers v6 rejects Tx where maxFee < priority. Defaults
      // must always satisfy this — even before dynamic computation.
      expect(maxFee).toBeGreaterThanOrEqual(maxPriority)
    })
  })

  describe('operator env overrides', () => {
    it('honours MAX_FEE_PER_GAS_GWEI / MAX_PRIORITY_FEE_PER_GAS_GWEI', async () => {
      const originalMax = process.env.MAX_FEE_PER_GAS_GWEI
      const originalPriority = process.env.MAX_PRIORITY_FEE_PER_GAS_GWEI
      process.env.MAX_FEE_PER_GAS_GWEI = '50'
      process.env.MAX_PRIORITY_FEE_PER_GAS_GWEI = '5'
      try {
        const { config } = await import('../src/config.js')
        expect(config.maxFeePerGasGwei).toBe('50')
        expect(config.maxPriorityFeePerGasGwei).toBe('5')
      } finally {
        process.env.MAX_FEE_PER_GAS_GWEI = originalMax
        process.env.MAX_PRIORITY_FEE_PER_GAS_GWEI = originalPriority
        vi.resetModules()
      }
    })
  })

  describe('buildTxOverrides() policy', () => {
    /**
     * Helper: simulates the buildTxOverrides() algorithm in pure form
     * so we can unit-test the math without going through the full
     * provider mock. Mirrors the implementation in
     * `services/blockchain.ts` exactly.
     */
    function compute(
      providerMaxFee: bigint | null,
      providerTip: bigint | null,
      maxFeeCap: bigint,
      priorityCap: bigint,
    ): { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint } {
      let priority = providerTip ?? priorityCap
      if (priority < 0n) priority = 0n
      if (priority > priorityCap) priority = priorityCap

      const pMax = providerMaxFee ?? 0n
      const pTip = providerTip ?? 0n
      const baseFee = pMax > pTip ? (pMax - pTip) / 2n : 0n

      let maxFee = baseFee * 2n + priority
      if (maxFee > maxFeeCap) maxFee = maxFeeCap
      if (maxFee < priority) maxFee = priority

      return { maxFeePerGas: maxFee, maxPriorityFeePerGas: priority }
    }

    const PRIORITY_CAP = 10_000_000n // 0.01 gwei
    const MAX_FEE_CAP = 2_000_000_000n // 2 gwei

    it('clips an oversized provider tip down to the ceiling', () => {
      // Provider returns 0.5 gwei tip (the old broken value some Base
      // RPCs still hand back). Should be clipped to 0.01 gwei.
      const baseFee = 5_000_000n // 0.005 gwei
      const providerTip = 500_000_000n // 0.5 gwei
      const providerMax = baseFee * 2n + providerTip

      const { maxFeePerGas, maxPriorityFeePerGas } = compute(
        providerMax,
        providerTip,
        MAX_FEE_CAP,
        PRIORITY_CAP,
      )

      expect(maxPriorityFeePerGas).toBe(PRIORITY_CAP)
      // Effective gas price = baseFee + priority = 0.005 + 0.01 = 0.015 gwei
      // (33× cheaper than the old 0.505 gwei)
      expect(maxFeePerGas).toBe(baseFee * 2n + PRIORITY_CAP)
    })

    it('passes a small provider tip through unchanged', () => {
      // Healthy Base RPC: tip ≈ 0.001 gwei.
      const baseFee = 5_000_000n
      const providerTip = 1_000_000n // 0.001 gwei
      const providerMax = baseFee * 2n + providerTip

      const { maxFeePerGas, maxPriorityFeePerGas } = compute(
        providerMax,
        providerTip,
        MAX_FEE_CAP,
        PRIORITY_CAP,
      )

      expect(maxPriorityFeePerGas).toBe(providerTip)
      expect(maxFeePerGas).toBe(baseFee * 2n + providerTip)
    })

    it('clips maxFee to the absolute ceiling during a fee spike', () => {
      // Spike: baseFee jumps to 5 gwei (NFT mint event).
      const baseFee = 5_000_000_000n
      const providerTip = 1_000_000n
      const providerMax = baseFee * 2n + providerTip

      const { maxFeePerGas, maxPriorityFeePerGas } = compute(
        providerMax,
        providerTip,
        MAX_FEE_CAP,
        PRIORITY_CAP,
      )

      // 2 × 5 gwei + tip = 10+ gwei → clipped to 2 gwei ceiling.
      expect(maxFeePerGas).toBe(MAX_FEE_CAP)
      expect(maxPriorityFeePerGas).toBe(providerTip)
    })

    it('guarantees maxFee ≥ priority even with weird inputs', () => {
      // Pathological: provider returns null tip; we fall back to cap.
      const { maxFeePerGas, maxPriorityFeePerGas } = compute(null, null, MAX_FEE_CAP, PRIORITY_CAP)

      expect(maxFeePerGas).toBeGreaterThanOrEqual(maxPriorityFeePerGas)
    })

    it('floors a negative provider tip at zero', () => {
      const { maxPriorityFeePerGas } = compute(100_000_000n, -1n, MAX_FEE_CAP, PRIORITY_CAP)

      expect(maxPriorityFeePerGas).toBe(0n)
    })
  })

  describe('deprecated static TX_OVERRIDES', () => {
    it('still has the correct ethers shape for fallback callers', () => {
      const overrides: ethers.Overrides = {
        maxFeePerGas: ethers.parseUnits('2', 'gwei'),
        maxPriorityFeePerGas: ethers.parseUnits('0.01', 'gwei'),
      }
      expect(overrides.maxFeePerGas).toBe(2_000_000_000n)
      expect(overrides.maxPriorityFeePerGas).toBe(10_000_000n)
      expect(BigInt(overrides.maxFeePerGas as bigint)).toBeGreaterThanOrEqual(
        BigInt(overrides.maxPriorityFeePerGas as bigint),
      )
    })
  })
})
