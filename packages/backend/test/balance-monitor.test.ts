/**
 * @file balance-monitor.test.ts
 *
 * Verifies that `services/balance-monitor.ts` emits the structured
 * `MINTER_BALANCE_LOW` warn line we wire into the operator cron, and
 * that it correctly stays silent when the balance is healthy or when
 * the cooldown is still active.
 *
 * Audit ref: F2.4, M12 (24h-sequence step #7).
 */
import { ethers } from 'ethers'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const balanceMock = vi.fn<() => Promise<bigint>>()

vi.mock('../src/services/blockchain.js', () => ({
  MIN_BALANCE_WEI: ethers.parseEther('0.005'),
  WARN_BALANCE_WEI: ethers.parseEther('0.025'),
  getMinterAddress: () => '0x000000000000000000000000000000000000abcd',
  getMinterBalance: () => balanceMock(),
}))

let warnCalls: Array<[Record<string, unknown>, string]> = []
let infoCalls: Array<[Record<string, unknown>, string]> = []
let debugCalls: Array<[Record<string, unknown>, string]> = []

vi.mock('../src/lib/logger.js', () => ({
  logger: {
    warn: (obj: Record<string, unknown>, msg: string) => {
      warnCalls.push([obj, msg])
    },
    info: (obj: Record<string, unknown>, msg: string) => {
      infoCalls.push([obj, msg])
    },
    debug: (obj: Record<string, unknown>, msg: string) => {
      debugCalls.push([obj, msg])
    },
    error: () => undefined,
    fatal: () => undefined,
  },
}))

const { checkBalanceAndWarn, _resetBalanceMonitorForTest } =
  await import('../src/services/balance-monitor.js')

describe('balance-monitor', () => {
  beforeEach(() => {
    warnCalls = []
    infoCalls = []
    debugCalls = []
    balanceMock.mockReset()
    _resetBalanceMonitorForTest()
  })

  afterEach(() => {
    _resetBalanceMonitorForTest()
  })

  it('emits MINTER_BALANCE_LOW when balance is below the warn threshold', async () => {
    balanceMock.mockResolvedValueOnce(ethers.parseEther('0.001'))
    await checkBalanceAndWarn()

    expect(warnCalls).toHaveLength(1)
    const [payload, msg] = warnCalls[0]
    expect(msg).toMatch(/MINTER_BALANCE_LOW/)
    expect(payload).toMatchObject({
      severity: 'OPERATIONAL',
      action: 'TOP_UP_REQUIRED',
      balanceEth: '0.001',
      warnThresholdEth: '0.025',
      minThresholdEth: '0.005',
      minterAddress: '0x000000000000000000000000000000000000abcd',
    })
  })

  it('also fires when balance equals exactly the warn threshold minus 1 wei', async () => {
    balanceMock.mockResolvedValueOnce(ethers.parseEther('0.025') - 1n)
    await checkBalanceAndWarn()

    expect(warnCalls).toHaveLength(1)
  })

  it('stays silent when balance is at or above the warn threshold', async () => {
    balanceMock.mockResolvedValueOnce(ethers.parseEther('0.025'))
    await checkBalanceAndWarn()
    expect(warnCalls).toHaveLength(0)

    balanceMock.mockResolvedValueOnce(ethers.parseEther('0.1'))
    await checkBalanceAndWarn()
    expect(warnCalls).toHaveLength(0)

    expect(debugCalls.length).toBeGreaterThanOrEqual(1)
  })

  it('respects the cooldown — back-to-back checks below threshold only warn once', async () => {
    balanceMock.mockResolvedValue(ethers.parseEther('0.001'))

    await checkBalanceAndWarn()
    await checkBalanceAndWarn()
    await checkBalanceAndWarn()

    expect(warnCalls).toHaveLength(1)
  })

  it('never throws when the balance fetch errors out', async () => {
    balanceMock.mockRejectedValueOnce(new Error('rpc 503'))
    await expect(checkBalanceAndWarn()).resolves.toBeUndefined()
    expect(warnCalls).toHaveLength(1)
    expect(warnCalls[0][1]).toMatch(/balance-monitor: failed to fetch minter balance/)
  })
})
