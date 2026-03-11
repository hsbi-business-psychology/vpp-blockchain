import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from '@/locales/en.json'
import de from '@/locales/de.json'
import docsEn from '@/locales/docs-en.json'
import docsDe from '@/locales/docs-de.json'

const defaultLocale = import.meta.env.VITE_DEFAULT_LOCALE || 'en'

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: { ...en, ...docsEn } },
    de: { translation: { ...de, ...docsDe } },
  },
  lng: localStorage.getItem('vpp-lang') || defaultLocale,
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
})

document.documentElement.lang = i18n.language
i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng
})

export default i18n
