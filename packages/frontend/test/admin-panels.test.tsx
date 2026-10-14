import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiRequestError, type SurveyInfo } from '@vpp/shared'

// Stable like the real hook; a new `t` per render would re-run effects.
const mockT = (key: string, opts?: Record<string, unknown>) =>
  opts && Object.keys(opts).length
    ? `${key} ${Object.entries(opts)
        .map(([k, v]) => `${k}=${String(v)}`)
        .join(' ')}`
    : key
const mockI18n = { language: 'de', changeLanguage: vi.fn() }

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mockT, i18n: mockI18n }),
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const mockApi = {
  awardPointsManually: vi.fn(),
  getPointsData: vi.fn(),
}
vi.mock('@/hooks/use-api', () => ({ useApi: () => mockApi }))

vi.mock('@/lib/config', () => ({
  config: { apiUrl: 'http://localhost:3000' },
  getTxUrl: (hash: string) => `https://explorer.test/tx/${hash}`,
}))

import { CollapsibleCard } from '@/components/ui/collapsible-card'
import { AwardPoints } from '@/components/admin/award-points'
import { SurveyTable } from '@/components/admin/survey-table'

// Radix Select uses pointer capture and scrollIntoView, which jsdom lacks.
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false
  Element.prototype.releasePointerCapture = () => {}
  Element.prototype.scrollIntoView = () => {}
})

function survey(overrides: Partial<SurveyInfo>): SurveyInfo {
  return {
    surveyId: 1,
    title: 'Studie',
    points: 1,
    maxClaims: 0,
    claimCount: 0,
    active: true,
    registeredAt: '2026-10-01T10:00:00.000Z',
    ...overrides,
  }
}

const ADMIN = '0x6f9B0eE6bd8E273e6EFfe70D31D8eA3a4DA9be37'
const STUDENT = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'

describe('CollapsibleCard', () => {
  it('starts closed and opens with the arrow', async () => {
    const user = userEvent.setup()
    render(
      <CollapsibleCard title="Rollen" description="Beschreibung">
        <p>Inhalt</p>
      </CollapsibleCard>,
    )

    const arrow = screen.getByRole('button', { name: /Rollen: common.expand/ })
    expect(arrow).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('Inhalt')).not.toBeVisible()
    expect(screen.queryByText('Beschreibung')).not.toBeInTheDocument()
    expect(document.getElementById(arrow.getAttribute('aria-controls')!)).not.toBeNull()

    await user.click(arrow)

    expect(screen.getByText('Inhalt')).toBeVisible()
    expect(screen.getByText('Beschreibung')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Rollen: common.collapse/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
  })

  it('opens by clicking the title row too', async () => {
    const user = userEvent.setup()
    render(
      <CollapsibleCard title="Abgaben">
        <p>Inhalt</p>
      </CollapsibleCard>,
    )

    await user.click(screen.getByText('Abgaben'))

    expect(screen.getByText('Inhalt')).toBeVisible()
  })

  it('can start open', () => {
    render(
      <CollapsibleCard title="Umfragen" defaultOpen>
        <p>Tabelle</p>
      </CollapsibleCard>,
    )

    expect(screen.getByText('Tabelle')).toBeInTheDocument()
  })
})

describe('SurveyTable', () => {
  const noop = () => {}

  it('shows only active surveys by default', () => {
    render(
      <SurveyTable
        surveys={[
          survey({ surveyId: 20, title: 'Läuft', active: true }),
          survey({ surveyId: 21, title: 'Vorbei', active: false }),
        ]}
        onDownloadTemplate={noop}
        onDeactivate={noop}
        onReactivate={noop}
        onRegenerateTemplate={noop}
      />,
    )

    expect(screen.getAllByText('Läuft').length).toBeGreaterThan(0)
    expect(screen.queryByText('Vorbei')).not.toBeInTheDocument()
  })

  it('says where older surveys are when none is active', () => {
    render(
      <SurveyTable
        surveys={[survey({ surveyId: 21, title: 'Vorbei', active: false })]}
        onDownloadTemplate={noop}
        onDeactivate={noop}
        onReactivate={noop}
        onRegenerateTemplate={noop}
      />,
    )

    expect(screen.getByText('admin.surveys.filter.noneActive')).toBeInTheDocument()
  })
})

describe('AwardPoints', () => {
  const sign = vi.fn<(message: string) => Promise<string>>()
  const onAwarded = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    sign.mockResolvedValue('0xsig')
    mockApi.getPointsData.mockResolvedValue({ wallet: STUDENT, totalPoints: 3, surveys: [] })
    mockApi.awardPointsManually.mockResolvedValue({
      student: STUDENT,
      points: 0.25,
      txHash: '0xaward',
      explorerUrl: 'https://explorer.test/tx/0xaward',
    })
  })

  async function openAndFill(surveys: SurveyInfo[], pick: string, address: string) {
    const user = userEvent.setup()
    render(
      <AwardPoints surveys={surveys} walletAddress={ADMIN} sign={sign} onAwarded={onAwarded} />,
    )
    await user.click(screen.getByRole('button', { name: /admin.award.title: common.expand/ }))
    await user.click(screen.getByRole('combobox'))
    await user.click(await screen.findByRole('option', { name: new RegExp(pick) }))
    await user.type(screen.getByLabelText('admin.award.wallet'), address)
    return user
  }

  it('signs a message naming survey and wallet and awards the points', async () => {
    const user = await openAndFill(
      [survey({ surveyId: 20, title: 'Phubbing', points: 0.25 })],
      'Phubbing',
      STUDENT,
    )

    expect(await screen.findByText(/admin.award.walletBalance points=3/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /admin.award.button/ }))
    await user.click(await screen.findByRole('button', { name: /admin.award.confirmButton/ }))

    await waitFor(() => expect(mockApi.awardPointsManually).toHaveBeenCalled())
    const message = sign.mock.calls[0][0]
    expect(message).toMatch(new RegExp(`^Award survey 20 to ${STUDENT} by ${ADMIN} at \\d+$`))
    expect(mockApi.awardPointsManually).toHaveBeenCalledWith(20, STUDENT, '0xsig', message)
    expect(onAwarded).toHaveBeenCalled()
  })

  it('blocks a wallet that already has the points', async () => {
    mockApi.getPointsData.mockResolvedValue({
      wallet: STUDENT,
      totalPoints: 1,
      surveys: [{ surveyId: 20, points: 1, claimedAt: '2026-10-14T10:00:00Z', txHash: '0x1' }],
    })

    await openAndFill([survey({ surveyId: 20, title: 'Phubbing' })], 'Phubbing', STUDENT)

    expect(await screen.findByText('admin.award.errorAlreadyAwarded')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /admin.award.button/ })).toBeDisabled()
  })

  it('explains that a deactivated survey has to be reactivated first', async () => {
    await openAndFill([survey({ surveyId: 21, title: 'Vorbei', active: false })], 'Vorbei', STUDENT)

    expect(screen.getByText('admin.award.inactiveHint')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /admin.award.button/ })).toBeDisabled()
  })

  it('flags an incomplete address', async () => {
    await openAndFill([survey({ surveyId: 20, title: 'Phubbing' })], 'Phubbing', '0x1234')

    expect(screen.getByText('admin.award.invalidAddress')).toBeInTheDocument()
    expect(mockApi.getPointsData).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /admin.award.button/ })).toBeDisabled()
  })

  it('shows the server reason when the award is refused', async () => {
    const { toast } = await import('sonner')
    mockApi.awardPointsManually.mockRejectedValue(
      new ApiRequestError('MAX_CLAIMS_REACHED', 'max', 409),
    )

    const user = await openAndFill(
      [survey({ surveyId: 20, title: 'Phubbing' })],
      'Phubbing',
      STUDENT,
    )
    await screen.findByText(/admin.award.walletBalance/)
    await user.click(screen.getByRole('button', { name: /admin.award.button/ }))
    await user.click(await screen.findByRole('button', { name: /admin.award.confirmButton/ }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('admin.award.errorMaxClaims'))
    expect(onAwarded).not.toHaveBeenCalled()
  })

  it('stays quiet when the admin cancels the wallet prompt', async () => {
    const { toast } = await import('sonner')
    sign.mockRejectedValue(Object.assign(new Error('User rejected'), { code: 4001 }))

    const user = await openAndFill(
      [survey({ surveyId: 20, title: 'Phubbing' })],
      'Phubbing',
      STUDENT,
    )
    await screen.findByText(/admin.award.walletBalance/)
    await user.click(screen.getByRole('button', { name: /admin.award.button/ }))
    await user.click(await screen.findByRole('button', { name: /admin.award.confirmButton/ }))

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })
    expect(toast.error).not.toHaveBeenCalled()
    expect(mockApi.awardPointsManually).not.toHaveBeenCalled()
  })
})
