import { useLocation } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Helmet } from 'react-helmet-async'

const OG_LOCALE: Record<string, string> = {
  de: 'de_DE',
  en: 'en_US',
}

const PAGE_TITLE_KEYS: Record<string, string> = {
  '/': 'pageTitle.home',
  '/points': 'pageTitle.points',
  '/claim': 'pageTitle.claim',
  '/admin': 'pageTitle.admin',
  '/docs': 'pageTitle.docs',
  '/impressum': 'pageTitle.impressum',
  '/datenschutz': 'pageTitle.datenschutz',
  '/barrierefreiheit': 'pageTitle.barrierefreiheit',
}

export function MetaTags() {
  const { t, i18n } = useTranslation()
  const { pathname } = useLocation()

  const base = '/' + pathname.split('/').filter(Boolean).slice(0, 1).join('/')
  const titleKey = PAGE_TITLE_KEYS[base] || PAGE_TITLE_KEYS[pathname]
  const pageTitle = titleKey ? t(titleKey) : 'VPP Blockchain'

  const description = t('meta.description')
  const keywords = t('meta.keywords')
  const ogLocale = OG_LOCALE[i18n.language] ?? 'en_US'
  const ogLocaleAlt = i18n.language === 'de' ? 'en_US' : 'de_DE'

  return (
    <Helmet>
      <html lang={i18n.language} />
      <title>{pageTitle}</title>
      <meta name="title" content={pageTitle} />
      <meta name="description" content={description} />
      <meta name="keywords" content={keywords} />

      <meta property="og:title" content={pageTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:locale" content={ogLocale} />
      <meta property="og:locale:alternate" content={ogLocaleAlt} />

      <meta name="twitter:title" content={pageTitle} />
      <meta name="twitter:description" content={description} />
    </Helmet>
  )
}
