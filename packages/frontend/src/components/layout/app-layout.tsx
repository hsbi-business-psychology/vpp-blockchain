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
  const isHome = currentPath === '/'

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex min-h-screen flex-col">
        {isHome && (
          <div className="pointer-events-none fixed inset-0 -z-10" aria-hidden="true">
            <div className="absolute left-1/2 top-[-10%] h-[60vh] w-[90vw] max-w-[1000px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,oklch(0.55_0.14_260/0.12),transparent_70%)] dark:bg-[radial-gradient(ellipse_at_center,oklch(0.55_0.16_280/0.22),transparent_70%)]" />
            <div className="absolute left-[-10vw] top-[50vh] h-[50vh] w-[50vw] rounded-full bg-[radial-gradient(ellipse_at_center,oklch(0.6_0.12_145/0.09),transparent_70%)] dark:bg-[radial-gradient(ellipse_at_center,oklch(0.5_0.14_280/0.12),transparent_70%)]" />
            <div className="absolute right-[-5vw] top-[65vh] h-[45vh] w-[50vw] rounded-full bg-[radial-gradient(ellipse_at_center,oklch(0.65_0.10_260/0.08),transparent_70%)] dark:bg-[radial-gradient(ellipse_at_center,oklch(0.55_0.12_310/0.12),transparent_70%)]" />
          </div>
        )}
        <Header currentPath={currentPath} onNavigate={onNavigate} />
        <main className="mx-auto w-full max-w-[1100px] flex-1 px-4 py-8 md:px-6">
          {children}
        </main>
        <Footer onNavigate={onNavigate} />
      </div>
    </TooltipProvider>
  )
}
