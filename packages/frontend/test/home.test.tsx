import { describe, it, expect, beforeAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router'
import { initI18n } from '@/lib/i18n'
import HomePage from '@/pages/home'

function renderWithRouter(ui: React.ReactElement) {
  return render(<BrowserRouter>{ui}</BrowserRouter>)
}

describe('HomePage', () => {
  beforeAll(async () => {
    await initI18n()
  })

  it('renders the hero title', () => {
    renderWithRouter(<HomePage />)
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })

  it('renders highlight cards for students and lecturers', () => {
    renderWithRouter(<HomePage />)
    expect(
      screen.getByRole('heading', { name: /For students|Für Studierende/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /For lecturers|Für Lehrende/i })).toBeInTheDocument()
  })

  it('renders the docs CTA section', () => {
    renderWithRouter(<HomePage />)
    expect(screen.getByText(/Open documentation|Dokumentation öffnen/i)).toBeInTheDocument()
  })

  it('renders CTA buttons', () => {
    renderWithRouter(<HomePage />)
    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBeGreaterThanOrEqual(2)
  })
})
