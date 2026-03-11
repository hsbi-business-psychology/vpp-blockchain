import { createBrowserRouter } from 'react-router'
import HomePage from '@/pages/home'
import WalletPage from '@/pages/wallet'
import ClaimPage from '@/pages/claim'
import PointsPage from '@/pages/points'
import ExplorerPage from '@/pages/explorer'
import AdminPage from '@/pages/admin'

export const router = createBrowserRouter([
  { path: '/', element: <HomePage /> },
  { path: '/wallet', element: <WalletPage /> },
  { path: '/claim', element: <ClaimPage /> },
  { path: '/points', element: <PointsPage /> },
  { path: '/explorer', element: <ExplorerPage /> },
  { path: '/admin', element: <AdminPage /> },
])
