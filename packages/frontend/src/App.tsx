import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router'
import '@/lib/i18n'
import { ThemeProvider } from '@/components/layout/theme-provider'
import { AppLayout } from '@/components/layout/app-layout'
import { Toaster } from '@/components/ui/sonner'
import HomePage from '@/pages/home'
import ClaimPage from '@/pages/claim'
import PointsPage from '@/pages/points'
import AdminPage from '@/pages/admin'
import ImprintPage from '@/pages/impressum'
import PrivacyPage from '@/pages/datenschutz'
import AccessibilityPage from '@/pages/barrierefreiheit'

function AppRoutes() {
  const navigate = useNavigate()
  const location = useLocation()

  return (
    <AppLayout currentPath={location.pathname} onNavigate={(href) => navigate(href)}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/claim" element={<ClaimPage />} />
        <Route path="/points" element={<PointsPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/impressum" element={<ImprintPage />} />
        <Route path="/datenschutz" element={<PrivacyPage />} />
        <Route path="/barrierefreiheit" element={<AccessibilityPage />} />
      </Routes>
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
