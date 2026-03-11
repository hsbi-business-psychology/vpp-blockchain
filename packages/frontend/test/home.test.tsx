import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router'
import '@/lib/i18n'
import HomePage from '@/pages/home'

function renderWithRouter(ui: React.ReactElement) {
  return render(<BrowserRouter>{ui}</BrowserRouter>)
}

describe('HomePage', () => {
  it('renders the hero title', () => {
    renderWithRouter(<HomePage />)
    expect(
      screen.getByRole('heading', { level: 1 }),
    ).toBeInTheDocument()
  })

  it('renders highlight cards for students and lecturers', () => {
    renderWithRouter(<HomePage />)
    expect(screen.getByText(/For students|Für Studierende/i)).toBeInTheDocument()
    expect(screen.getByText(/For lecturers|Für Lehrende/i)).toBeInTheDocument()
  })

  it('renders the FAQ section', () => {
    renderWithRouter(<HomePage />)
    expect(
      screen.getByText(/Frequently asked questions|Häufige Fragen/i),
    ).toBeInTheDocument()
  })

  it('renders CTA buttons', () => {
    renderWithRouter(<HomePage />)
    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBeGreaterThanOrEqual(2)
  })
})
