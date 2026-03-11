import { useEffect, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router'
import '@/lib/i18n'
import { ThemeProvider } from '@/components/layout/theme-provider'
import { AppLayout } from '@/components/layout/app-layout'
import { Toaster } from '@/components/ui/sonner'
import HomePage from '@/pages/home'

const ClaimPage = lazy(() => import('@/pages/claim'))
const PointsPage = lazy(() => import('@/pages/points'))
const AdminPage = lazy(() => import('@/pages/admin'))
const ImprintPage = lazy(() => import('@/pages/impressum'))
const PrivacyPage = lazy(() => import('@/pages/datenschutz'))
const AccessibilityPage = lazy(() => import('@/pages/barrierefreiheit'))
const DocsPage = lazy(() => import('@/pages/docs'))

const PAGE_TITLES: Record<string, string> = {
  '/': 'VPP Blockchain – Versuchspersonenpunkte digital & fälschungssicher',
  '/points': 'Meine Punkte – VPP Blockchain',
  '/claim': 'Punkte einlösen – VPP Blockchain',
  '/admin': 'Lehrenden-Bereich – VPP Blockchain',
  '/docs': 'Dokumentation – VPP Blockchain',
  '/impressum': 'Impressum – VPP Blockchain',
  '/datenschutz': 'Datenschutz – VPP Blockchain',
  '/barrierefreiheit': 'Barrierefreiheit – VPP Blockchain',
}

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
    const base = '/' + pathname.split('/').filter(Boolean).slice(0, 1).join('/')
    document.title = PAGE_TITLES[base] || PAGE_TITLES[pathname] || 'VPP Blockchain'
  }, [pathname])
  return null
}

function AppRoutes() {
  const navigate = useNavigate()
  const location = useLocation()

  return (
    <AppLayout currentPath={location.pathname} onNavigate={(href) => navigate(href)}>
      <ScrollToTop />
      <Suspense fallback={<div className="flex min-h-[50vh] items-center justify-center"><div className="size-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/claim" element={<ClaimPage />} />
          <Route path="/points" element={<PointsPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/docs" element={<DocsPage />} />
          <Route path="/docs/:slug" element={<DocsPage />} />
          <Route path="/impressum" element={<ImprintPage />} />
          <Route path="/datenschutz" element={<PrivacyPage />} />
          <Route path="/barrierefreiheit" element={<AccessibilityPage />} />
        </Routes>
      </Suspense>
    </AppLayout>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
      <Toaster />
    </ThemeProvider>
  )
}
