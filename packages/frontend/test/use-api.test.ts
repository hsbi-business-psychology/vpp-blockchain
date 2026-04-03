import { renderHook } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useApi } from '@/hooks/use-api'
import { ApiRequestError } from '@vpp/shared'

const BASE_URL = 'http://localhost:3000'

function mockFetchSuccess(data: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve({ success: true, data }),
  })
}

function mockFetchError(error: string, message: string, status = 400, details?: unknown[]) {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve({ success: false, error, message, details }),
  })
}

describe('useApi', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  describe('apiFetch (via claimPoints)', () => {
    it('returns data on successful response', async () => {
      const data = { txHash: '0xabc', explorerUrl: 'https://example.com/tx/0xabc', points: 10 }
      vi.stubGlobal('fetch', mockFetchSuccess(data))

      const { result } = renderHook(() => useApi())
      const res = await result.current.claimPoints({
        walletAddress: '0x1',
        surveyId: 1,
        secret: 's',
        signature: 'sig',
        message: 'msg',
      })

      expect(res).toEqual(data)
      expect(fetch).toHaveBeenCalledWith(
        `${BASE_URL}/api/v1/claim`,
        expect.objectContaining({ method: 'POST' }),
      )
    })

    it('throws ApiRequestError on API error', async () => {
      vi.stubGlobal('fetch', mockFetchError('ALREADY_CLAIMED', 'Already claimed', 409))

      const { result } = renderHook(() => useApi())

      try {
        await result.current.claimPoints({
          walletAddress: '0x1',
          surveyId: 1,
          secret: 's',
          signature: 'sig',
          message: 'msg',
        })
        expect.fail('should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(ApiRequestError)
        const apiErr = err as ApiRequestError
        expect(apiErr.code).toBe('ALREADY_CLAIMED')
        expect(apiErr.status).toBe(409)
        expect(apiErr.message).toBe('Already claimed')
      }
    })

    it('passes validation details array from Zod errors', async () => {
      const details = [
        { field: 'surveyId', message: 'Required' },
        { field: 'secret', message: 'Too short' },
      ]
      vi.stubGlobal('fetch', mockFetchError('VALIDATION_ERROR', 'Invalid input', 400, details))

      const { result } = renderHook(() => useApi())

      try {
        await result.current.claimPoints({
          walletAddress: '0x1',
          surveyId: 0,
          secret: '',
          signature: 'sig',
          message: 'msg',
        })
        expect.fail('should have thrown')
      } catch (err) {
        const apiErr = err as ApiRequestError
        expect(apiErr.details).toEqual(details)
      }
    })

    it('propagates network errors', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

      const { result } = renderHook(() => useApi())

      await expect(
        result.current.claimPoints({
          walletAddress: '0x1',
          surveyId: 1,
          secret: 's',
          signature: 'sig',
          message: 'msg',
        }),
      ).rejects.toThrow('Failed to fetch')
    })
  })

  describe('getSurveys', () => {
    it('sends admin auth headers', async () => {
      const surveys = [{ id: 1, title: 'Test', points: 10 }]
      vi.stubGlobal('fetch', mockFetchSuccess(surveys))

      const { result } = renderHook(() => useApi())
      const res = await result.current.getSurveys('sig', 'msg')

      expect(res).toEqual(surveys)
      const [, opts] = vi.mocked(fetch).mock.calls[0]
      expect((opts?.headers as Record<string, string>)['x-admin-signature']).toBe('sig')
      expect((opts?.headers as Record<string, string>)['x-admin-message']).toBe('msg')
    })
  })

  describe('getPointsData', () => {
    it('fetches points for address', async () => {
      const pointsData = { totalPoints: 42, surveys: [] }
      vi.stubGlobal('fetch', mockFetchSuccess(pointsData))

      const { result } = renderHook(() => useApi())
      const res = await result.current.getPointsData('0xAddr')

      expect(res).toEqual(pointsData)
      expect(fetch).toHaveBeenCalledWith(`${BASE_URL}/api/v1/points/0xAddr`, expect.any(Object))
    })
  })

  describe('downloadTemplate', () => {
    it('returns blob on success', async () => {
      const mockBlob = new Blob(['data'], { type: 'text/html' })
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          blob: () => Promise.resolve(mockBlob),
        }),
      )

      const { result } = renderHook(() => useApi())
      const res = await result.current.downloadTemplate(1, 'secret', 'sosci', 'sig', 'msg')

      expect(res).toEqual(mockBlob)
    })

    it('throws on non-ok response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))

      const { result } = renderHook(() => useApi())

      await expect(
        result.current.downloadTemplate(1, 'secret', 'sosci', 'sig', 'msg'),
      ).rejects.toThrow('Failed to download template')
    })
  })

  describe('addAdmin', () => {
    it('posts admin address and returns tx info', async () => {
      const data = { txHash: '0xTx', explorerUrl: 'https://example.com/tx/0xTx' }
      vi.stubGlobal('fetch', mockFetchSuccess(data))

      const { result } = renderHook(() => useApi())
      const res = await result.current.addAdmin('0xNewAdmin', 'sig', 'msg')

      expect(res).toEqual(data)
      const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string)
      expect(body.address).toBe('0xNewAdmin')
    })
  })
})
