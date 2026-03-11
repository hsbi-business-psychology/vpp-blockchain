import type { ReactNode } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Separator } from '@/components/ui/separator'
import { SidebarNav } from './sidebar-nav'
import { MobileNav } from './mobile-nav'
import { ThemeToggle } from './theme-toggle'
import { LanguageSwitcher } from './language-switcher'

interface AppLayoutProps {
  children: ReactNode
  currentPath: string
  onNavigate: (href: string) => void
  appName: string
}

export function AppLayout({ children, currentPath, onNavigate, appName }: AppLayoutProps) {
  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex min-h-screen">
        {/* Desktop sidebar */}
        <aside className="hidden md:flex md:w-16 md:flex-col md:border-r md:border-sidebar-border md:bg-sidebar">
          <div className="flex h-16 items-center justify-center">
            <button
              onClick={() => onNavigate('/')}
              className="flex size-10 items-center justify-center rounded-lg bg-primary transition-opacity hover:opacity-90"
            >
              <span className="text-lg font-bold text-primary-foreground">V</span>
            </button>
          </div>
          <Separator className="bg-sidebar-border" />
          <div className="flex flex-1 flex-col justify-between py-4">
            <SidebarNav currentPath={currentPath} onNavigate={onNavigate} />
            <div className="flex flex-col items-center gap-2 px-2 pb-2">
              <LanguageSwitcher />
              <ThemeToggle />
            </div>
          </div>
        </aside>

        {/* Main content */}
        <div className="flex flex-1 flex-col">
          {/* Mobile header */}
          <header className="flex h-14 items-center gap-3 border-b px-4 md:hidden">
            <MobileNav currentPath={currentPath} onNavigate={onNavigate} appName={appName} />
            <span className="text-sm font-semibold">{appName}</span>
            <div className="ml-auto flex items-center gap-1">
              <LanguageSwitcher />
              <ThemeToggle />
            </div>
          </header>

          {/* Page content */}
          <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">{children}</main>
        </div>
      </div>
    </TooltipProvider>
  )
}
