import { Home, Wallet, Gift, BarChart3, Search, ShieldCheck } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

const navItems = [
  { icon: Home, label: 'Home', href: '/' },
  { icon: Wallet, label: 'Wallet', href: '/wallet' },
  { icon: Gift, label: 'Claim', href: '/claim' },
  { icon: BarChart3, label: 'Points', href: '/points' },
  { icon: Search, label: 'Explorer', href: '/explorer' },
  { icon: ShieldCheck, label: 'Admin', href: '/admin' },
] as const

interface SidebarNavProps {
  currentPath: string
  onNavigate: (href: string) => void
}

export function SidebarNav({ currentPath, onNavigate }: SidebarNavProps) {
  return (
    <nav className="flex flex-col gap-1 px-2">
      {navItems.map(({ icon: Icon, label, href }) => {
        const isActive = currentPath === href || (href !== '/' && currentPath.startsWith(href))

        return (
          <Tooltip key={href}>
            <TooltipTrigger asChild>
              <button
                onClick={() => onNavigate(href)}
                className={cn(
                  'flex size-10 items-center justify-center rounded-lg transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )}
              >
                <Icon className="size-5" />
                <span className="sr-only">{label}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{label}</TooltipContent>
          </Tooltip>
        )
      })}
    </nav>
  )
}

export { navItems }
