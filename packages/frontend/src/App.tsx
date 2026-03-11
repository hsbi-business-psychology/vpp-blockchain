import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router'
import '@/lib/i18n'
import { ThemeProvider } from '@/components/layout/theme-provider'
import { AppLayout } from '@/components/layout/app-layout'
import { Toaster } from '@/components/ui/sonner'
import HomePage from '@/pages/home'
import WalletPage from '@/pages/wallet'
import ClaimPage from '@/pages/claim'
import PointsPage from '@/pages/points'
import ExplorerPage from '@/pages/explorer'
import AdminPage from '@/pages/admin'

const APP_NAME = import.meta.env.VITE_APP_NAME || 'VPP Blockchain'

function AppRoutes() {
  const navigate = useNavigate()
  const location = useLocation()

  return (
    <AppLayout currentPath={location.pathname} onNavigate={(href) => navigate(href)} appName={APP_NAME}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/wallet" element={<WalletPage />} />
        <Route path="/claim" element={<ClaimPage />} />
        <Route path="/points" element={<PointsPage />} />
        <Route path="/explorer" element={<ExplorerPage />} />
        <Route path="/admin" element={<AdminPage />} />
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
