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
    expect(screen.getByText('Verifiable Participant Points')).toBeInTheDocument()
  })

  it('renders feature cards', () => {
    renderWithRouter(<HomePage />)
    expect(screen.getByText('Transparent')).toBeInTheDocument()
    expect(screen.getByText('Open Source')).toBeInTheDocument()
    expect(screen.getByText('Cost Efficient')).toBeInTheDocument()
  })

  it('renders the how-it-works section', () => {
    renderWithRouter(<HomePage />)
    expect(screen.getAllByText('Create Wallet').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Complete Survey')).toBeInTheDocument()
    expect(screen.getAllByText('Claim Points').length).toBeGreaterThanOrEqual(1)
  })

  it('renders CTA buttons', () => {
    renderWithRouter(<HomePage />)
    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBeGreaterThanOrEqual(2)
  })
})
