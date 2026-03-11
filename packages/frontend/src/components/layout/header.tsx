import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Menu, X } from 'lucide-react'
import { ThemeToggle } from './theme-toggle'
import { LanguageSwitcher } from './language-switcher'

interface HeaderProps {
  currentPath: string
  onNavigate: (href: string) => void
}

export function Header({ currentPath, onNavigate }: HeaderProps) {
  const { t } = useTranslation()
  const [menuOpen, setMenuOpen] = useState(false)

  const navLinks = [
    { href: '/points', label: t('nav.points') },
    { href: '/admin', label: t('nav.admin') },
  ]

  function handleNav(href: string) {
    onNavigate(href)
    setMenuOpen(false)
  }

  return (
    <>
      <header className="w-full bg-background">
        <div className="mx-auto flex max-w-[1100px] items-center justify-between px-4 py-5 md:px-6">
          <button
            onClick={() => handleNav('/')}
            className="flex items-center"
          >
            <img src="/hsbi-logo-light.png" alt="HSBI" className="h-12 dark:hidden md:h-16" />
            <img src="/hsbi-logo-dark.png" alt="HSBI" className="hidden h-12 dark:block md:h-16" />
          </button>

          <nav className="hidden items-center gap-1 md:flex">
            {navLinks.map(({ href, label }) => (
              <button
                key={href}
                onClick={() => handleNav(href)}
                className={`relative px-3 py-2 text-base font-semibold transition-colors hover:text-primary ${
                  currentPath === href
                    ? 'text-primary after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-full after:bg-primary'
                    : 'text-foreground'
                }`}
              >
                {label}
              </button>
            ))}
            <div className="ml-2 flex items-center gap-1">
              <LanguageSwitcher />
              <ThemeToggle />
            </div>
          </nav>

          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex size-9 items-center justify-center rounded-md text-foreground md:hidden"
            aria-label="Toggle menu"
          >
            {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </header>

      {menuOpen && (
        <div className="fixed inset-0 z-50 bg-background md:hidden">
          <div className="flex items-center justify-between px-4 py-5">
            <button
              onClick={() => handleNav('/')}
              className="flex items-center"
            >
              <img src="/hsbi-logo-light.png" alt="HSBI" className="h-12 dark:hidden" />
              <img src="/hsbi-logo-dark.png" alt="HSBI" className="hidden h-12 dark:block" />
            </button>
            <button
              onClick={() => setMenuOpen(false)}
              className="flex size-9 items-center justify-center"
              aria-label="Close menu"
            >
              <X className="size-5" />
            </button>
          </div>
          <nav className="flex flex-col gap-1 px-4 pt-6">
            <button
              onClick={() => handleNav('/')}
              className={`rounded-md px-4 py-3 text-left text-base font-semibold ${
                currentPath === '/' ? 'bg-accent text-primary' : ''
              }`}
            >
              {t('nav.home')}
            </button>
            {navLinks.map(({ href, label }) => (
              <button
                key={href}
                onClick={() => handleNav(href)}
                className={`rounded-md px-4 py-3 text-left text-base font-semibold ${
                  currentPath === href ? 'bg-accent text-primary' : ''
                }`}
              >
                {label}
              </button>
            ))}
            <div className="mt-4 flex items-center gap-2 px-4">
              <LanguageSwitcher />
              <ThemeToggle />
            </div>
          </nav>
        </div>
      )}
    </>
  )
}
