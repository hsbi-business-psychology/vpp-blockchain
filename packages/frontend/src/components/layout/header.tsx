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
    { href: '/docs', label: t('nav.docs') },
    { href: '/admin', label: t('nav.admin') },
  ]

  function handleNav(href: string) {
    onNavigate(href)
    setMenuOpen(false)
  }

  return (
    <>
      <header className="w-full bg-transparent">
        <div className="mx-auto flex max-w-[1100px] items-center justify-between px-4 py-5 md:px-6">
          <button
            onClick={() => handleNav('/')}
            className="flex items-center"
            aria-label={t('nav.home')}
          >
            <img src="/hsbi-logo-light.png" alt="HSBI – Startseite" className="h-12 dark:hidden md:h-16" />
            <img src="/hsbi-logo-dark.png" alt="HSBI – Startseite" className="hidden h-12 dark:block md:h-16" aria-hidden="true" />
          </button>

          <nav className="hidden items-center gap-1 md:flex" aria-label={t('nav.main', 'Hauptnavigation')}>
            {navLinks.map(({ href, label }) => {
              const isActive = currentPath === href || currentPath.startsWith(href + '/')
              return (
                <button
                  key={href}
                  onClick={() => handleNav(href)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`relative px-3 py-2 text-base font-semibold transition-colors hover:text-primary ${
                    isActive
                      ? 'text-primary after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-full after:bg-primary'
                      : 'text-foreground'
                  }`}
                >
                  {label}
                </button>
              )
            })}
            <div className="ml-2 flex items-center gap-1">
              <LanguageSwitcher />
              <ThemeToggle />
            </div>
          </nav>

          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex size-9 items-center justify-center rounded-md text-foreground md:hidden"
            aria-label={menuOpen ? t('nav.closeMenu', 'Menü schließen') : t('nav.openMenu', 'Menü öffnen')}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
          </button>
        </div>
      </header>

      {menuOpen && (
        <div className="fixed inset-0 z-50 bg-background md:hidden" role="dialog" aria-label={t('nav.mobileMenu', 'Navigation')}>
          <div className="flex items-center justify-between px-4 py-5">
            <button
              onClick={() => handleNav('/')}
              className="flex items-center"
              aria-label={t('nav.home')}
            >
              <img src="/hsbi-logo-light.png" alt="HSBI – Startseite" className="h-12 dark:hidden" />
              <img src="/hsbi-logo-dark.png" alt="" className="hidden h-12 dark:block" aria-hidden="true" />
            </button>
            <button
              onClick={() => setMenuOpen(false)}
              className="flex size-9 items-center justify-center"
              aria-label={t('nav.closeMenu', 'Menü schließen')}
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
          <nav className="flex flex-col gap-1 px-4 pt-6" aria-label={t('nav.main', 'Hauptnavigation')}>
            <button
              onClick={() => handleNav('/')}
              aria-current={currentPath === '/' ? 'page' : undefined}
              className={`rounded-md px-4 py-3 text-left text-base font-semibold ${
                currentPath === '/' ? 'bg-accent text-primary' : ''
              }`}
            >
              {t('nav.home')}
            </button>
            {navLinks.map(({ href, label }) => {
              const isActive = currentPath === href || currentPath.startsWith(href + '/')
              return (
                <button
                  key={href}
                  onClick={() => handleNav(href)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`rounded-md px-4 py-3 text-left text-base font-semibold ${
                    isActive ? 'bg-accent text-primary' : ''
                  }`}
                >
                  {label}
                </button>
              )
            })}
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
