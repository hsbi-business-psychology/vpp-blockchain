import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useTheme } from 'next-themes'
import { Menu, X, Home, Coins, BookOpen, ShieldCheck, Sun, Moon, Globe } from 'lucide-react'
import { ThemeToggle } from './theme-toggle'
import { LanguageSwitcher } from './language-switcher'

interface HeaderProps {
  currentPath: string
  onNavigate: (href: string) => void
}

const LANGUAGES = [
  { code: 'de', label: 'DE' },
  { code: 'en', label: 'EN' },
] as const

export function Header({ currentPath, onNavigate }: HeaderProps) {
  const { t, i18n } = useTranslation()
  const { theme, setTheme } = useTheme()
  const [menuOpen, setMenuOpen] = useState(false)

  const navLinks = [
    { href: '/', label: t('nav.home'), icon: Home },
    { href: '/points', label: t('nav.points'), icon: Coins },
    { href: '/docs', label: t('nav.docs'), icon: BookOpen },
    { href: '/admin', label: t('nav.admin'), icon: ShieldCheck },
  ]

  function handleNav(href: string) {
    onNavigate(href)
    setMenuOpen(false)
  }

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [menuOpen])

  function changeLanguage(code: string) {
    i18n.changeLanguage(code)
    localStorage.setItem('vpp-lang', code)
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
            <img src="/hsbi-logo-light.png" alt="HSBI – Startseite" width={262} height={192} fetchPriority="high" className="h-12 w-auto dark:hidden md:h-16" />
            <img src="/hsbi-logo-dark.png" alt="" width={262} height={192} fetchPriority="high" className="hidden h-12 w-auto dark:block md:h-16" aria-hidden="true" />
          </button>

          <nav className="hidden items-center gap-1 md:flex" aria-label={t('nav.main')}>
            {navLinks.slice(1).map(({ href, label }) => {
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
            aria-label={menuOpen ? t('nav.closeMenu') : t('nav.openMenu')}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
          </button>
        </div>
      </header>

      {menuOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-background md:hidden" role="dialog" aria-label={t('nav.mobileMenu')}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-5">
            <button
              onClick={() => handleNav('/')}
              className="flex items-center"
              aria-label={t('nav.home')}
            >
              <img src="/hsbi-logo-light.png" alt="HSBI – Startseite" width={262} height={192} className="h-12 w-auto dark:hidden" />
              <img src="/hsbi-logo-dark.png" alt="" width={262} height={192} className="hidden h-12 w-auto dark:block" aria-hidden="true" />
            </button>
            <button
              onClick={() => setMenuOpen(false)}
              className="flex size-9 items-center justify-center rounded-md hover:bg-accent"
              aria-label={t('nav.closeMenu')}
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>

          {/* Navigation + Settings */}
          <nav className="px-4 pt-2" aria-label={t('nav.main')}>
            <div className="space-y-1">
              {navLinks.map(({ href, label, icon: Icon }) => {
                const isActive = href === '/'
                  ? currentPath === '/'
                  : currentPath === href || currentPath.startsWith(href + '/')
                return (
                  <button
                    key={href}
                    onClick={() => handleNav(href)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`flex w-full items-center gap-3 rounded-lg px-4 py-3.5 text-left text-base font-semibold transition-colors ${
                      isActive
                        ? 'bg-primary/10 text-primary'
                        : 'text-foreground hover:bg-accent'
                    }`}
                  >
                    <Icon className={`size-5 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} aria-hidden="true" />
                    {label}
                  </button>
                )
              })}
            </div>

            {/* Settings */}
            <div className="mt-6 space-y-3 border-t border-border pt-5">
              {/* Language */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5 text-sm font-medium text-muted-foreground">
                  <Globe className="size-4" aria-hidden="true" />
                  {t('nav.language')}
                </div>
                <div className="flex overflow-hidden rounded-lg border border-border" role="radiogroup" aria-label={t('nav.language')}>
                  {LANGUAGES.map(({ code, label }) => (
                    <button
                      key={code}
                      role="radio"
                      aria-checked={i18n.language === code}
                      onClick={() => changeLanguage(code)}
                      className={`px-4 py-1.5 text-sm font-semibold transition-colors ${
                        i18n.language === code
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-background text-foreground hover:bg-accent'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Theme */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5 text-sm font-medium text-muted-foreground">
                  {theme === 'dark'
                    ? <Moon className="size-4" aria-hidden="true" />
                    : <Sun className="size-4" aria-hidden="true" />}
                  {t('nav.theme')}
                </div>
                <div className="flex overflow-hidden rounded-lg border border-border" role="radiogroup" aria-label={t('nav.theme')}>
                  <button
                    role="radio"
                    aria-checked={theme === 'light'}
                    onClick={() => setTheme('light')}
                    className={`flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                      theme === 'light'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-background text-foreground hover:bg-accent'
                    }`}
                  >
                    <Sun className="size-3.5" aria-hidden="true" />
                    {t('nav.themeLight')}
                  </button>
                  <button
                    role="radio"
                    aria-checked={theme === 'dark'}
                    onClick={() => setTheme('dark')}
                    className={`flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                      theme === 'dark'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-background text-foreground hover:bg-accent'
                    }`}
                  >
                    <Moon className="size-3.5" aria-hidden="true" />
                    {t('nav.themeDark')}
                  </button>
                </div>
              </div>
            </div>
          </nav>
        </div>
      )}
    </>
  )
}
