import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ApiRequestError } from '@vpp/shared'

const mockWalletReturn = {
  wallet: null as { address: string; privateKey: string; type: string } | null,
  loading: false,
  hasWallet: false,
  isMetaMask: false,
  hasMetaMask: false,
  create: vi.fn(),
  importKey: vi.fn(),
  connectMetaMask: vi.fn(),
  remove: vi.fn(),
  sign: vi.fn<(msg: string) => Promise<string>>().mockResolvedValue('0xSig'),
  downloadKey: vi.fn(),
}

const mockApiReturn = {
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
}

vi.mock('@/hooks/use-wallet', () => ({
  useWallet: () => mockWalletReturn,
}))

vi.mock('@/hooks/use-api', () => ({
  useApi: () => mockApiReturn,
}))

vi.mock('@/lib/config', () => ({
  config: { apiUrl: 'http://localhost:3000' },
  getTxUrl: (hash: string) => `https://explorer.test/tx/${hash}`,
}))

// Shape-valid V2 query parameters: s=<surveyId>, n=<nonce, 16-128 url-safe
// base64 chars>, t=<token, exactly 43 url-safe base64 chars>. Values do not
// have to be cryptographically valid because the backend mock just resolves.
const VALID_NONCE = 'AAAAAAAAAAAAAAAA'
const VALID_TOKEN = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const VALID_PARAMS = `?s=1&n=${VALID_NONCE}&t=${VALID_TOKEN}`

function renderClaim(params = VALID_PARAMS) {
  return render(
    <MemoryRouter initialEntries={[`/claim${params}`]}>
      <React.Suspense fallback={<div>Loading...</div>}>
        <ClaimPage />
      </React.Suspense>
    </MemoryRouter>,
  )
}

let ClaimPage: React.ComponentType

describe('ClaimPage', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    mockWalletReturn.wallet = null
    mockWalletReturn.hasWallet = false
    const mod = await import('@/pages/claim')
    ClaimPage = mod.default
  })

  it('shows error when surveyId, nonce, or token is missing', () => {
    renderClaim('?s=1&n=' + VALID_NONCE)

    expect(screen.getByText('claim.error.missingParams')).toBeInTheDocument()
  })

  it('shows wallet creation prompt when no wallet exists', () => {
    renderClaim()

    expect(screen.getByText('claim.noWallet')).toBeInTheDocument()
    expect(screen.getByText('claim.createFirst')).toBeInTheDocument()
  })

  it('shows sign step when wallet exists', () => {
    mockWalletReturn.wallet = { address: '0xMyWallet', privateKey: '0xPK', type: 'local' }
    mockWalletReturn.hasWallet = true

    renderClaim()

    expect(screen.getByText('0xMyWallet')).toBeInTheDocument()
    expect(screen.getByText('common.submit')).toBeInTheDocument()
  })

  it('completes claim flow successfully', async () => {
    const user = userEvent.setup()
    mockWalletReturn.wallet = { address: '0xMyWallet', privateKey: '0xPK', type: 'local' }
    mockWalletReturn.hasWallet = true
    mockApiReturn.claimPoints.mockResolvedValue({
      txHash: '0xTxHash123',
      points: 25,
      explorerUrl: 'https://explorer.test/tx/0xTxHash123',
    })

    renderClaim()

    const submitBtn = screen.getByText('common.submit')
    await user.click(submitBtn)

    await waitFor(() => {
      expect(screen.getByText('claim.success.title')).toBeInTheDocument()
    })

    expect(screen.getByText('25')).toBeInTheDocument()
    expect(screen.getByText('0xTxHash123')).toBeInTheDocument()

    // Verify the claim went through with the V2 nonce + token shape.
    expect(mockApiReturn.claimPoints).toHaveBeenCalledWith(
      expect.objectContaining({
        walletAddress: '0xMyWallet',
        surveyId: 1,
        nonce: VALID_NONCE,
        token: VALID_TOKEN,
      }),
    )
  })

  it('shows ALREADY_CLAIMED error with translated message', async () => {
    const user = userEvent.setup()
    mockWalletReturn.wallet = { address: '0xMyWallet', privateKey: '0xPK', type: 'local' }
    mockWalletReturn.hasWallet = true
    mockApiReturn.claimPoints.mockRejectedValue(
      new ApiRequestError('ALREADY_CLAIMED', 'Already claimed', 409),
    )

    renderClaim()

    await user.click(screen.getByText('common.submit'))

    await waitFor(() => {
      expect(screen.getByText('claim.error.alreadyClaimed')).toBeInTheDocument()
    })
  })

  it('shows NONCE_USED error (replay protection) with friendly copy', async () => {
    const user = userEvent.setup()
    mockWalletReturn.wallet = { address: '0xMyWallet', privateKey: '0xPK', type: 'local' }
    mockWalletReturn.hasWallet = true
    mockApiReturn.claimPoints.mockRejectedValue(
      new ApiRequestError('NONCE_USED', 'Nonce already consumed', 409),
    )

    renderClaim()

    await user.click(screen.getByText('common.submit'))

    await waitFor(() => {
      expect(screen.getByText('claim.error.nonceUsed')).toBeInTheDocument()
    })
  })

  it('shows INVALID_TOKEN error when HMAC verification fails', async () => {
    const user = userEvent.setup()
    mockWalletReturn.wallet = { address: '0xMyWallet', privateKey: '0xPK', type: 'local' }
    mockWalletReturn.hasWallet = true
    mockApiReturn.claimPoints.mockRejectedValue(
      new ApiRequestError('INVALID_TOKEN', 'Bad signature', 403),
    )

    renderClaim()

    await user.click(screen.getByText('common.submit'))

    await waitFor(() => {
      expect(screen.getByText('claim.error.invalidToken')).toBeInTheDocument()
    })
  })

  it('shows generic error for unknown failures', async () => {
    const user = userEvent.setup()
    mockWalletReturn.wallet = { address: '0xMyWallet', privateKey: '0xPK', type: 'local' }
    mockWalletReturn.hasWallet = true
    mockApiReturn.claimPoints.mockRejectedValue(new Error('Network failure'))

    renderClaim()

    await user.click(screen.getByText('common.submit'))

    await waitFor(() => {
      expect(screen.getByText('claim.error.generic')).toBeInTheDocument()
    })
  })

  it('has accessible stepper with role group and aria-current', () => {
    mockWalletReturn.wallet = { address: '0xMyWallet', privateKey: '0xPK', type: 'local' }
    mockWalletReturn.hasWallet = true

    renderClaim()

    const stepper = screen.getByRole('group', { name: 'claim.stepper.label' })
    expect(stepper).toBeInTheDocument()

    const currentStep = stepper.querySelector('[aria-current="step"]')
    expect(currentStep).toBeInTheDocument()
  })
})
