import { renderHook } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockContract = {
  totalPoints: vi.fn(),
  surveyPoints: vi.fn(),
  claimed: vi.fn(),
  getSurveyInfo: vi.fn(),
  isWalletSubmitted: vi.fn(),
  isAdmin: vi.fn(),
}

const contractsByUrl = new Map<string, Partial<typeof mockContract>>()

vi.mock('ethers', () => ({
  ethers: {
    JsonRpcProvider: vi.fn((url: string) => ({ url })),
    Contract: vi.fn(
      (_address: string, _abi: unknown, provider: { url: string }) =>
        contractsByUrl.get(provider.url) ?? mockContract,
    ),
    isError: (error: { code?: string } | null, code: string) => error?.code === code,
  },
}))

vi.mock('@/lib/contract-abi', () => ({
  SURVEY_POINTS_ABI: [{ fake: 'abi' }],
}))

vi.mock('@/lib/config', () => ({
  config: {
    rpcUrl: 'https://rpc.test',
    contractAddress: '0xContractAddr',
  },
}))

describe('useBlockchain', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    contractsByUrl.clear()
    // Reset cached singleton between tests
    vi.resetModules()
  })

  async function getHook() {
    const mod = await import('@/hooks/use-blockchain')
    return renderHook(() => mod.useBlockchain())
  }

  async function getHookWithRpcs(rpcUrl: string) {
    vi.doMock('@/lib/config', () => ({
      config: { rpcUrl, contractAddress: '0xContractAddr' },
    }))
    vi.resetModules()
    return getHook()
  }

  it('getTotalPoints returns number from bigint', async () => {
    mockContract.totalPoints.mockResolvedValue(BigInt(42))

    const { result } = await getHook()
    const points = await result.current.getTotalPoints('0xAddr')

    expect(points).toBe(42)
    expect(mockContract.totalPoints).toHaveBeenCalledWith('0xAddr')
  })

  it('getSurveyPoints returns number for address+surveyId', async () => {
    mockContract.surveyPoints.mockResolvedValue(BigInt(10))

    const { result } = await getHook()
    const points = await result.current.getSurveyPoints('0xAddr', 1)

    expect(points).toBe(10)
    expect(mockContract.surveyPoints).toHaveBeenCalledWith('0xAddr', 1)
  })

  it('hasClaimed returns boolean', async () => {
    mockContract.claimed.mockResolvedValue(true)

    const { result } = await getHook()
    const claimed = await result.current.hasClaimed('0xAddr', 1)

    expect(claimed).toBe(true)
    expect(mockContract.claimed).toHaveBeenCalledWith('0xAddr', 1)
  })

  it('getSurveyInfo maps tuple response to object', async () => {
    const timestamp = Math.floor(Date.now() / 1000)
    mockContract.getSurveyInfo.mockResolvedValue([
      BigInt(1), // surveyId
      BigInt(50), // points
      BigInt(100), // maxClaims
      BigInt(25), // claimCount
      true, // active
      BigInt(timestamp), // registeredAt
    ])

    const { result } = await getHook()
    const info = await result.current.getSurveyInfo(1)

    expect(info.points).toBe(50)
    expect(info.maxClaims).toBe(100)
    expect(info.claimCount).toBe(25)
    expect(info.active).toBe(true)
    expect(info.registeredAt).toEqual(new Date(timestamp * 1000))
  })

  it('isWalletSubmitted returns boolean', async () => {
    mockContract.isWalletSubmitted.mockResolvedValue(false)

    const { result } = await getHook()
    const submitted = await result.current.isWalletSubmitted('0xAddr')

    expect(submitted).toBe(false)
    expect(mockContract.isWalletSubmitted).toHaveBeenCalledWith('0xAddr')
  })

  it('isAdmin returns boolean', async () => {
    mockContract.isAdmin.mockResolvedValue(true)

    const { result } = await getHook()
    const admin = await result.current.isAdmin('0xAddr')

    expect(admin).toBe(true)
    expect(mockContract.isAdmin).toHaveBeenCalledWith('0xAddr')
  })

  it('caches provider and contract instances across calls', async () => {
    const { ethers } = await import('ethers')
    mockContract.totalPoints.mockResolvedValue(BigInt(1))

    const { result } = await getHook()
    await result.current.getTotalPoints('0xA')
    await result.current.getTotalPoints('0xB')

    expect(ethers.JsonRpcProvider).toHaveBeenCalledTimes(1)
    expect(ethers.Contract).toHaveBeenCalledTimes(1)
  })

  it('propagates RPC errors from contract calls', async () => {
    mockContract.totalPoints.mockRejectedValue(new Error('RPC timeout'))

    const { result } = await getHook()

    await expect(result.current.getTotalPoints('0xAddr')).rejects.toThrow('RPC timeout')
  })

  it('moves on to the next RPC when the first one fails', async () => {
    const down = { totalPoints: vi.fn().mockRejectedValue(new Error('403 Forbidden')) }
    const up = { totalPoints: vi.fn().mockResolvedValue(BigInt(7)) }
    contractsByUrl.set('https://a.test', down)
    contractsByUrl.set('https://b.test', up)

    const { result } = await getHookWithRpcs('https://a.test, https://b.test')

    await expect(result.current.getTotalPoints('0xAddr')).resolves.toBe(7)
    await expect(result.current.getTotalPoints('0xAddr')).resolves.toBe(7)
    // The second read starts with the RPC that answered the first one.
    expect(down.totalPoints).toHaveBeenCalledTimes(1)
  })

  it('moves on when an RPC stalls', async () => {
    contractsByUrl.set('https://a.test', { totalPoints: vi.fn(() => new Promise<never>(() => {})) })
    contractsByUrl.set('https://b.test', { totalPoints: vi.fn().mockResolvedValue(BigInt(3)) })
    const { result } = await getHookWithRpcs('https://a.test,https://b.test')

    vi.useFakeTimers()
    try {
      const points = result.current.getTotalPoints('0xAddr')
      await vi.advanceTimersByTimeAsync(8_000)
      await expect(points).resolves.toBe(3)
    } finally {
      vi.useRealTimers()
    }
  })

  it('returns a contract revert without asking the next RPC', async () => {
    const revert = Object.assign(new Error('execution reverted'), { code: 'CALL_EXCEPTION' })
    const first = { isAdmin: vi.fn().mockRejectedValue(revert) }
    const second = { isAdmin: vi.fn().mockResolvedValue(true) }
    contractsByUrl.set('https://a.test', first)
    contractsByUrl.set('https://b.test', second)

    const { result } = await getHookWithRpcs('https://a.test,https://b.test')

    await expect(result.current.isAdmin('0xAddr')).rejects.toBe(revert)
    expect(second.isAdmin).not.toHaveBeenCalled()
  })

  it('throws when contract address is empty', async () => {
    vi.doMock('@/lib/config', () => ({
      config: { rpcUrl: 'https://rpc.test', contractAddress: '' },
    }))
    vi.resetModules()

    const mod = await import('@/hooks/use-blockchain')
    const { result } = renderHook(() => mod.useBlockchain())

    await expect(result.current.getTotalPoints('0xAddr')).rejects.toThrow(
      'Contract address not configured',
    )
  })
})
