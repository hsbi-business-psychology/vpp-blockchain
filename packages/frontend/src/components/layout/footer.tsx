import { useTranslation } from 'react-i18next'

interface FooterProps {
  onNavigate: (href: string) => void
}

export function Footer({ onNavigate }: FooterProps) {
  const { t } = useTranslation()
  const year = new Date().getFullYear()

  const legalLinks = [
    { href: '/impressum', label: t('footer.imprint') },
    { href: '/datenschutz', label: t('footer.privacy') },
    { href: '/barrierefreiheit', label: t('footer.accessibility') },
  ]

  return (
    <footer className="bg-neutral-950 text-neutral-300" role="contentinfo">
      <div className="mx-auto flex max-w-[1100px] flex-col gap-8 px-4 py-14 md:flex-row md:justify-between md:px-6">
        <div className="text-center md:text-left">
          <h3 className="mb-3 text-xl font-semibold text-white">{t('footer.title')}</h3>
          <p className="text-base">{t('footer.text')}</p>
        </div>

        <div className="text-center md:text-left">
          <h3 className="mb-3 text-xl font-semibold text-white">{t('footer.contactTitle')}</h3>
          <p className="text-base">{t('footer.contactPerson')}</p>
          <p className="text-base">{t('footer.contactPhone')}</p>
          <p className="text-base">{t('footer.contactEmail')}</p>
        </div>
      </div>

      <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-between gap-4 border-t border-neutral-800 px-4 py-5 md:px-6">
        <small className="text-sm text-neutral-400">&copy; {year} HSBI</small>
        <nav className="flex flex-wrap gap-4" aria-label={t('footer.legalNav', 'Rechtliches')}>
          {legalLinks.map(({ href, label }) => (
            <button
              key={href}
              onClick={() => onNavigate(href)}
              className="text-base font-medium text-neutral-300 underline-offset-2 hover:text-white hover:underline"
            >
              {label}
            </button>
          ))}
        </nav>
      </div>
    </footer>
  )
}
