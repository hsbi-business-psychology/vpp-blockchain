/**
 * @file admin-auth.test.tsx
 *
 * Regression tests for the admin auto-auth flow on `/admin`. Specifically
 * guards against the bug described in audit F5.2 / M9: when the admin
 * rejects (or accidentally cancels) the MetaMask sign popup, the
 * `useEffect` that auto-fires `handleAuth` must not re-trigger on the
 * next React re-render — otherwise the popup re-opens immediately and
 * the admin is locked into an infinite popup loop with no UI escape.
 *
 * Audit ref: F5.2 (Bereich 5), M9 (24h-sequence step #10).
 */
import React, { Suspense } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockWalletReturn = {
  wallet: { address: '0xAdmin', privateKey: '0xPK', type: 'local' as const },
  loading: false,
  hasWallet: true,
  isMetaMask: false,
  hasMetaMask: false,
  create: vi.fn(),
  importKey: vi.fn(),
  connectMetaMask: vi.fn(),
  remove: vi.fn(),
  sign: vi.fn<(msg: string) => Promise<string>>(),
  downloadKey: vi.fn(),
}

const mockApiReturn = {
  claimPoints: vi.fn(),
  getSurveys: vi.fn().mockResolvedValue([]),
  registerSurvey: vi.fn(),
  getSurveyKey: vi.fn(),
  rotateSurveyKey: vi.fn(),
  downloadTemplate: vi.fn(),
  deactivateSurvey: vi.fn(),
  reactivateSurvey: vi.fn(),
  revokePoints: vi.fn(),
  getWalletSubmissionStatus: vi.fn(),
  markWalletSubmitted: vi.fn(),
  unmarkWalletSubmitted: vi.fn(),
  getSystemStatus: vi.fn(),
  getAdmins: vi.fn().mockResolvedValue([]),
  getPointsData: vi.fn(),
  addAdmin: vi.fn(),
  removeAdmin: vi.fn(),
  setAdminLabel: vi.fn(),
}

const mockBlockchain = {
  isAdmin: vi.fn<(addr: string) => Promise<boolean>>().mockResolvedValue(true),
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { returnObjects?: boolean } | string) => {
      if (typeof opts === 'object' && opts?.returnObjects) return []
      if (typeof opts === 'string') return opts
      return key
    },
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
  Trans: ({ children }: { children: React.ReactNode }) => children,
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}))

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

vi.mock('@/hooks/use-wallet', () => ({ useWallet: () => mockWalletReturn }))
vi.mock('@/hooks/use-api', () => ({ useApi: () => mockApiReturn }))
vi.mock('@/hooks/use-blockchain', () => ({
  useBlockchain: () => mockBlockchain,
}))

vi.mock('@/lib/config', () => ({
  config: { apiUrl: 'http://localhost:3000' },
  getTxUrl: (hash: string) => `https://explorer.test/tx/${hash}`,
}))

let AdminPage: React.ComponentType

function renderAdmin() {
  return render(
    <MemoryRouter initialEntries={['/admin']}>
      <Suspense fallback={<div>Loading...</div>}>
        <AdminPage />
      </Suspense>
    </MemoryRouter>,
  )
}

describe('AdminPage auto-auth (F5.2 regression)', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    mockBlockchain.isAdmin.mockResolvedValue(true)
    mockApiReturn.getSurveys.mockResolvedValue([])
    mockApiReturn.getAdmins.mockResolvedValue([])
    const mod = await import('@/pages/admin')
    AdminPage = mod.default
  })

  it('does NOT re-fire sign() after the user rejects the popup', async () => {
    const userRejected = Object.assign(new Error('User denied message signature.'), { code: 4001 })
    mockWalletReturn.sign.mockRejectedValue(userRejected)

    renderAdmin()

    await waitFor(() => {
      expect(mockWalletReturn.sign).toHaveBeenCalledTimes(1)
    })

    // Wait long enough that any pending re-render / effect cycle has
    // settled. Without the authFailed latch, the auto-auth effect would
    // re-trigger on the next tick and sign() would be called again.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300))
    })

    expect(mockWalletReturn.sign).toHaveBeenCalledTimes(1)

    await waitFor(() => {
      expect(screen.getByText('admin.auth.rejected.title')).toBeInTheDocument()
    })
  })

  it('also handles ethers ACTION_REJECTED code without re-firing', async () => {
    const ethersRejected = Object.assign(new Error('user rejected action'), {
      code: 'ACTION_REJECTED',
    })
    mockWalletReturn.sign.mockRejectedValue(ethersRejected)

    renderAdmin()

    await waitFor(() => {
      expect(mockWalletReturn.sign).toHaveBeenCalledTimes(1)
    })

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300))
    })

    expect(mockWalletReturn.sign).toHaveBeenCalledTimes(1)
  })

  it('re-arms sign() when the admin clicks "Sign again" (no infinite loop on second rejection)', async () => {
    const userRejected = Object.assign(new Error('User denied message signature.'), { code: 4001 })
    // Both attempts get rejected: this isolates us from any sign() calls
    // a successfully-rendered dashboard would trigger (e.g. RoleManagement
    // fetching the admin list on mount) and lets us assert the exact
    // pre/post-click counts.
    mockWalletReturn.sign.mockRejectedValue(userRejected)

    renderAdmin()

    await waitFor(() => {
      expect(mockWalletReturn.sign).toHaveBeenCalledTimes(1)
    })

    const retryLabel = await screen.findByText('admin.auth.rejected.retry')
    const retryBtn = retryLabel.closest('button')
    expect(retryBtn).not.toBeNull()
    expect(retryBtn!.disabled).toBe(false)

    await act(async () => {
      fireEvent.click(retryBtn!)
    })

    await waitFor(() => {
      expect(mockWalletReturn.sign).toHaveBeenCalledTimes(2)
    })

    // Critical: the second rejection must again latch authFailed=true and
    // must NOT cascade into a third (or fourth, ...) auto-retry. If the
    // F5.2 loop ever regresses, sign() would keep climbing here.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300))
    })
    expect(mockWalletReturn.sign).toHaveBeenCalledTimes(2)

    // The retry button is back, ready for another manual attempt.
    expect(screen.getByText('admin.auth.rejected.retry')).toBeInTheDocument()
  })
})
