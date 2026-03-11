import { Menu } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { navItems } from './sidebar-nav'
import { cn } from '@/lib/utils'

interface MobileNavProps {
  currentPath: string
  onNavigate: (href: string) => void
  appName: string
}

export function MobileNav({ currentPath, onNavigate, appName }: MobileNavProps) {
  const [open, setOpen] = useState(false)

  const handleNavigate = (href: string) => {
    onNavigate(href)
    setOpen(false)
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="size-5" />
          <span className="sr-only">Open menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-left">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary">
              <span className="text-sm font-bold text-primary-foreground">V</span>
            </div>
            {appName}
          </SheetTitle>
        </SheetHeader>
        <nav className="mt-6 flex flex-col gap-1">
          {navItems.map(({ icon: Icon, label, href }) => {
            const isActive = currentPath === href || (href !== '/' && currentPath.startsWith(href))

            return (
              <button
                key={href}
                onClick={() => handleNavigate(href)}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )}
              >
                <Icon className="size-5" />
                {label}
              </button>
            )
          })}
        </nav>
      </SheetContent>
    </Sheet>
  )
}
