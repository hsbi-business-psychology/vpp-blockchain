import React, { Suspense } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { returnObjects?: boolean }) => {
      if (opts?.returnObjects) return []
      return key
    },
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
  Trans: ({ children }: { children: React.ReactNode }) => children,
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}))

vi.mock('@/hooks/use-wallet', () => ({
  useWallet: () => ({
    wallet: null,
    loading: false,
    hasWallet: false,
    isMetaMask: false,
    hasMetaMask: false,
    create: vi.fn(),
    importKey: vi.fn(),
    connectMetaMask: vi.fn(),
    remove: vi.fn(),
    sign: vi.fn(),
    downloadKey: vi.fn(),
  }),
}))

vi.mock('@/hooks/use-api', () => ({
  useApi: () => ({
    claimPoints: vi.fn(),
    getSurveys: vi.fn(),
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
    getAdmins: vi.fn(),
    getPointsData: vi.fn(),
    addAdmin: vi.fn(),
    removeAdmin: vi.fn(),
    setAdminLabel: vi.fn(),
  }),
}))

vi.mock('@/hooks/use-blockchain', () => ({
  useBlockchain: () => ({
    getTotalPoints: vi.fn(),
    getSurveyPoints: vi.fn(),
    hasClaimed: vi.fn(),
    getSurveyInfo: vi.fn(),
    isWalletSubmitted: vi.fn(),
    isAdmin: vi.fn().mockResolvedValue(false),
  }),
}))

vi.mock('@/lib/config', () => ({
  config: {
    apiUrl: 'http://localhost:3000',
    rpcUrl: 'https://rpc.test',
    contractAddress: '0xTest',
    explorerUrl: 'https://explorer.test',
    appName: 'VPP Test',
    contractDeployBlock: 0,
    defaultLocale: 'en',
  },
  getTxUrl: (hash: string) => `https://explorer.test/tx/${hash}`,
  getAddressUrl: (addr: string) => `https://explorer.test/address/${addr}`,
}))

vi.mock('@/lib/contract-abi', () => ({
  SURVEY_POINTS_ABI: [],
}))

vi.mock('ethers', () => ({
  ethers: {
    JsonRpcProvider: vi.fn(() => ({})),
    Contract: vi.fn(() => ({})),
    Wallet: { createRandom: vi.fn(), fromPhrase: vi.fn() },
    Mnemonic: { isValidMnemonic: vi.fn(() => false) },
    LangEn: { wordlist: vi.fn(() => ({ getWord: (i: number) => `word${i}` })) },
    isAddress: vi.fn(() => true),
    wordlists: { en: { getWord: (i: number) => `word${i}` } },
  },
}))

function renderPage(Page: React.ComponentType, path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Suspense fallback={<div data-testid="suspense-fallback">Loading...</div>}>
        <Routes>
          <Route path="*" element={<Page />} />
        </Routes>
      </Suspense>
    </MemoryRouter>,
  )
}

describe('Routing — page renderability', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('/ renders HomePage with heading', async () => {
    const { default: HomePage } = await import('@/pages/home')
    renderPage(HomePage)
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })

  it('/claim renders ClaimPage', async () => {
    const { default: ClaimPage } = await import('@/pages/claim')
    // V2 url shape: ?s=<id>&n=<nonce>&t=<token> — fixture nonce/token are
    // shape-only (the page never verifies them client-side; only mounts).
    renderPage(
      ClaimPage,
      '/claim?s=1&n=AAAAAAAAAAAAAAAA&t=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    )
    expect(screen.getByText('claim.title')).toBeInTheDocument()
  })

  it('/points renders PointsPage', async () => {
    const { default: PointsPage } = await import('@/pages/points')
    renderPage(PointsPage, '/points')
    expect(screen.getByText('points.title')).toBeInTheDocument()
  })

  it('/admin renders AdminPage', async () => {
    const { default: AdminPage } = await import('@/pages/admin')
    renderPage(AdminPage, '/admin')
    await waitFor(() => {
      expect(screen.getByText('admin.title')).toBeInTheDocument()
    })
  })

  it('/docs renders DocsPage', async () => {
    const { default: DocsPage } = await import('@/pages/docs')
    renderPage(DocsPage, '/docs')
    expect(screen.getByText('docs.nav.title')).toBeInTheDocument()
  })

  it('/impressum renders ImprintPage', async () => {
    const { default: ImprintPage } = await import('@/pages/impressum')
    renderPage(ImprintPage, '/impressum')
    expect(screen.getByText('imprint.title')).toBeInTheDocument()
  })

  it('/datenschutz renders PrivacyPage', async () => {
    const { default: PrivacyPage } = await import('@/pages/datenschutz')
    renderPage(PrivacyPage, '/datenschutz')
    expect(screen.getByText('privacy.title')).toBeInTheDocument()
  })

  it('/barrierefreiheit renders AccessibilityPage', async () => {
    const { default: AccessibilityPage } = await import('@/pages/barrierefreiheit')
    renderPage(AccessibilityPage, '/barrierefreiheit')
    expect(screen.getByText('accessibility.title')).toBeInTheDocument()
  })

  it('/unknown renders NotFoundPage', async () => {
    const { default: NotFoundPage } = await import('@/pages/not-found')
    renderPage(NotFoundPage, '/unknown')
    expect(screen.getByText('404')).toBeInTheDocument()
    expect(screen.getByText('notFound.title')).toBeInTheDocument()
  })

  it('lazy-loaded page shows Suspense fallback', async () => {
    const LazyPage = React.lazy(
      () =>
        new Promise<{ default: React.ComponentType }>((resolve) => {
          setTimeout(() => resolve({ default: () => <div>Loaded</div> }), 100)
        }),
    )

    render(
      <MemoryRouter>
        <Suspense fallback={<div data-testid="suspense-fallback">Loading...</div>}>
          <Routes>
            <Route path="*" element={<LazyPage />} />
          </Routes>
        </Suspense>
      </MemoryRouter>,
    )

    expect(screen.getByTestId('suspense-fallback')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('Loaded')).toBeInTheDocument()
    })
  })
})
