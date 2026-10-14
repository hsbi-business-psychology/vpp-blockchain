import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { SurveyInfo } from '@vpp/shared'

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

import { CollapsibleCard } from '@/components/ui/collapsible-card'
import { SurveyTable } from '@/components/admin/survey-table'

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
    expect(screen.queryByText('Inhalt')).not.toBeInTheDocument()
    expect(screen.queryByText('Beschreibung')).not.toBeInTheDocument()

    await user.click(arrow)

    expect(screen.getByText('Inhalt')).toBeInTheDocument()
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

    expect(screen.getByText('Inhalt')).toBeInTheDocument()
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
