import { renderHook } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useApi } from '@/hooks/use-api'
import { ApiRequestError } from '@vpp/shared'

const BASE_URL = 'http://localhost:3000'

const VALID_NONCE = 'AAAAAAAAAAAAAAAA'
const VALID_TOKEN = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'

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
        nonce: VALID_NONCE,
        token: VALID_TOKEN,
        signature: 'sig',
        message: 'msg',
      })

      expect(res).toEqual(data)
      expect(fetch).toHaveBeenCalledWith(
        `${BASE_URL}/api/v1/claim`,
        expect.objectContaining({ method: 'POST' }),
      )

      // Body must contain nonce + token (V2 contract surface), not the
      // V1 `secret` field. Ensures we cannot regress to plaintext.
      const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string)
      expect(body.nonce).toBe(VALID_NONCE)
      expect(body.token).toBe(VALID_TOKEN)
      expect(body.secret).toBeUndefined()
    })

    it('throws ApiRequestError on API error', async () => {
      vi.stubGlobal('fetch', mockFetchError('ALREADY_CLAIMED', 'Already claimed', 409))

      const { result } = renderHook(() => useApi())

      try {
        await result.current.claimPoints({
          walletAddress: '0x1',
          surveyId: 1,
          nonce: VALID_NONCE,
          token: VALID_TOKEN,
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
        { field: 'nonce', message: 'Invalid shape' },
      ]
      vi.stubGlobal('fetch', mockFetchError('VALIDATION_ERROR', 'Invalid input', 400, details))

      const { result } = renderHook(() => useApi())

      try {
        await result.current.claimPoints({
          walletAddress: '0x1',
          surveyId: 0,
          nonce: '',
          token: '',
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
          nonce: VALID_NONCE,
          token: VALID_TOKEN,
          signature: 'sig',
          message: 'msg',
        }),
      ).rejects.toThrow('Failed to fetch')
    })
  })

  describe('getSurveys', () => {
    it('fetches surveys without auth headers (public endpoint)', async () => {
      const surveys = [{ id: 1, title: 'Test', points: 10 }]
      vi.stubGlobal('fetch', mockFetchSuccess(surveys))

      const { result } = renderHook(() => useApi())
      const res = await result.current.getSurveys()

      expect(res).toEqual(surveys)
      const [url, opts] = vi.mocked(fetch).mock.calls[0]
      expect(url).toContain('/api/v1/surveys')
      expect((opts?.headers as Record<string, string>)['x-admin-signature']).toBeUndefined()
    })
  })

  describe('registerSurvey', () => {
    it('does not pass `secret` (V2: server mints HMAC key)', async () => {
      const data = {
        txHash: '0xtx',
        explorerUrl: 'https://example.com/tx/0xtx',
        templateDownloadUrl: '/api/v1/surveys/1/template',
        key: 'somebase64urlkey',
        keyCreatedAt: new Date().toISOString(),
      }
      vi.stubGlobal('fetch', mockFetchSuccess(data))

      const { result } = renderHook(() => useApi())
      const res = await result.current.registerSurvey({
        surveyId: 1,
        points: 5,
        title: 'My Survey',
        adminSignature: 'sig',
        adminMessage: 'msg',
      })

      expect(res).toEqual(data)
      const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string)
      expect(body.secret).toBeUndefined()
      expect(body.title).toBe('My Survey')
    })
  })

  describe('getSurveyKey + rotateSurveyKey', () => {
    it('GET /api/v1/surveys/:id/key with admin headers', async () => {
      const data = { surveyId: 1, key: 'k', keyCreatedAt: new Date().toISOString() }
      vi.stubGlobal('fetch', mockFetchSuccess(data))

      const { result } = renderHook(() => useApi())
      const res = await result.current.getSurveyKey(1, 'sig', 'msg')

      expect(res).toEqual(data)
      const [url, opts] = vi.mocked(fetch).mock.calls[0]
      expect(url).toBe(`${BASE_URL}/api/v1/surveys/1/key`)
      expect((opts?.headers as Record<string, string>)['x-admin-signature']).toBe('sig')
    })

    it('POST /api/v1/surveys/:id/key/rotate', async () => {
      const data = { surveyId: 1, key: 'k2', keyCreatedAt: new Date().toISOString() }
      vi.stubGlobal('fetch', mockFetchSuccess(data))

      const { result } = renderHook(() => useApi())
      await result.current.rotateSurveyKey(1, 'sig', 'msg')

      const [url, opts] = vi.mocked(fetch).mock.calls[0]
      expect(url).toBe(`${BASE_URL}/api/v1/surveys/1/key/rotate`)
      expect(opts?.method).toBe('POST')
    })
  })

  describe('reactivateSurvey + revokePoints', () => {
    it('POST /api/v1/surveys/:id/reactivate with admin headers', async () => {
      vi.stubGlobal('fetch', mockFetchSuccess({ txHash: '0xtx' }))

      const { result } = renderHook(() => useApi())
      await result.current.reactivateSurvey(1, 'sig', 'msg')

      const [url, opts] = vi.mocked(fetch).mock.calls[0]
      expect(url).toBe(`${BASE_URL}/api/v1/surveys/1/reactivate`)
      expect(opts?.method).toBe('POST')
      expect((opts?.headers as Record<string, string>)['x-admin-signature']).toBe('sig')
    })

    it('POST /api/v1/surveys/:id/revoke with wallet address in body', async () => {
      vi.stubGlobal('fetch', mockFetchSuccess({ txHash: '0xtx' }))

      const { result } = renderHook(() => useApi())
      await result.current.revokePoints(1, '0xWallet', 'sig', 'msg')

      const [url, opts] = vi.mocked(fetch).mock.calls[0]
      expect(url).toBe(`${BASE_URL}/api/v1/surveys/1/revoke`)
      expect(opts?.method).toBe('POST')
      const body = JSON.parse(opts?.body as string)
      expect(body.walletAddress).toBe('0xWallet')
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
    it('returns blob on success — V2 takes only format + admin headers', async () => {
      const mockBlob = new Blob(['data'], { type: 'text/html' })
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          blob: () => Promise.resolve(mockBlob),
        }),
      )

      const { result } = renderHook(() => useApi())
      const res = await result.current.downloadTemplate(1, 'sosci', 'sig', 'msg')

      expect(res).toEqual(mockBlob)

      // Body must NOT contain `secret` anymore (V2 fetches the HMAC key
      // server-side from survey-keys store).
      const opts = vi.mocked(fetch).mock.calls[0][1]
      const body = JSON.parse(opts?.body as string)
      expect(body.format).toBe('sosci')
      expect(body.secret).toBeUndefined()
    })

    it('throws on non-ok response', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          json: () => Promise.resolve({}),
        }),
      )

      const { result } = renderHook(() => useApi())

      await expect(result.current.downloadTemplate(1, 'sosci', 'sig', 'msg')).rejects.toThrow(
        'Failed to download template',
      )
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
