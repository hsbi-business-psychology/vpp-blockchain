import { useEffect, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router'
import { useTranslation } from 'react-i18next'
import { HelmetProvider } from 'react-helmet-async'
import '@/lib/i18n'
import { ThemeProvider } from '@/components/layout/theme-provider'
import { AppLayout } from '@/components/layout/app-layout'
import { MetaTags } from '@/components/seo/meta-tags'
import { Toaster } from '@/components/ui/sonner'
import HomePage from '@/pages/home'

const ClaimPage = lazy(() => import('@/pages/claim'))
const PointsPage = lazy(() => import('@/pages/points'))
const AdminPage = lazy(() => import('@/pages/admin'))
const ImprintPage = lazy(() => import('@/pages/impressum'))
const PrivacyPage = lazy(() => import('@/pages/datenschutz'))
const AccessibilityPage = lazy(() => import('@/pages/barrierefreiheit'))
const DocsPage = lazy(() => import('@/pages/docs'))
const NotFoundPage = lazy(() => import('@/pages/not-found'))

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

function AppRoutes() {
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useTranslation()

  return (
    <AppLayout currentPath={location.pathname} onNavigate={(href) => navigate(href)}>
      <ScrollToTop />
      <MetaTags />
      <Suspense
        fallback={
          <div
            className="flex min-h-[50vh] items-center justify-center"
            role="status"
            aria-label={t('common.loading')}
          >
            <div className="size-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        }
      >
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
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </AppLayout>
  )
}

export default function App() {
  return (
    <HelmetProvider>
      <ThemeProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
        <Toaster />
      </ThemeProvider>
    </HelmetProvider>
  )
}
