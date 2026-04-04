import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

export const SUPPORTED_LOCALES = [
  { code: 'en', label: 'English', shortLabel: 'EN' },
  { code: 'de', label: 'Deutsch', shortLabel: 'DE' },
] as const

export type LocaleCode = (typeof SUPPORTED_LOCALES)[number]['code']

type LocaleModule = { default: Record<string, unknown> }

const localeLoaders: Record<string, () => [Promise<LocaleModule>, Promise<LocaleModule>]> = {
  en: () => [import('@/locales/en.json'), import('@/locales/docs-en.json')],
  de: () => [import('@/locales/de.json'), import('@/locales/docs-de.json')],
}

async function loadLocale(lng: string) {
  if (i18n.hasResourceBundle(lng, 'translation')) return
  const loader = localeLoaders[lng] ?? localeLoaders['en']
  const [app, docs] = await Promise.all(loader())
  i18n.addResourceBundle(lng, 'translation', { ...app.default, ...docs.default }, true, true)
}

const defaultLocale = import.meta.env.VITE_DEFAULT_LOCALE || 'en'
const initialLocale = localStorage.getItem('vpp-lang') || defaultLocale

export async function changeLocale(lng: string) {
  await loadLocale(lng)
  await i18n.changeLanguage(lng)
  localStorage.setItem('vpp-lang', lng)
}

export async function initI18n() {
  await i18n.use(initReactI18next).init({
    lng: initialLocale,
    fallbackLng: 'en',
    partialBundledLanguages: true,
    resources: {},
    interpolation: {
      escapeValue: false,
    },
  })

  await loadLocale(initialLocale)

  document.documentElement.lang = i18n.language
  i18n.on('languageChanged', (lng) => {
    document.documentElement.lang = lng
  })
}

export default i18n
