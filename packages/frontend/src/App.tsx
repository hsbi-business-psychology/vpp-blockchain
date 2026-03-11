import { useState } from 'react'
import { ThemeProvider } from '@/components/layout/theme-provider'
import { AppLayout } from '@/components/layout/app-layout'
import { Toaster } from '@/components/ui/sonner'

const APP_NAME = import.meta.env.VITE_APP_NAME || 'VPP Blockchain'

export default function App() {
  const [currentPath, setCurrentPath] = useState('/')

  return (
    <ThemeProvider>
      <AppLayout
        currentPath={currentPath}
        onNavigate={setCurrentPath}
        appName={APP_NAME}
      >
        <div className="mx-auto max-w-5xl">
          <h1 className="text-2xl font-bold">
            {currentPath === '/' ? 'Home' : currentPath.slice(1).charAt(0).toUpperCase() + currentPath.slice(2)}
          </h1>
          <p className="mt-2 text-muted-foreground">Page content will be added with the router.</p>
        </div>
      </AppLayout>
      <Toaster />
    </ThemeProvider>
  )
}
