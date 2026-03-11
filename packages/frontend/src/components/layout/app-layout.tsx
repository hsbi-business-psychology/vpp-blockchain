import type { ReactNode } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Header } from './header'
import { Footer } from './footer'

interface AppLayoutProps {
  children: ReactNode
  currentPath: string
  onNavigate: (href: string) => void
}

export function AppLayout({ children, currentPath, onNavigate }: AppLayoutProps) {
  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex min-h-screen flex-col">
        <Header currentPath={currentPath} onNavigate={onNavigate} />
        <main className="mx-auto w-full max-w-[1100px] flex-1 px-4 py-8 md:px-6">
          {children}
        </main>
        <Footer onNavigate={onNavigate} />
      </div>
    </TooltipProvider>
  )
}
