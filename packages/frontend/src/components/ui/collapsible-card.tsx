import { useId, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface CollapsibleCardProps {
  title: ReactNode
  /** Shown under the title while the card is open. */
  description?: ReactNode
  /** Optional info icon next to the title. */
  info?: { label: string; text: string }
  /** Shown next to the arrow, open or closed (e.g. a status). */
  aside?: ReactNode
  defaultOpen?: boolean
  /** Controlled mode; pass both or neither. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  contentClassName?: string
  children: ReactNode
}

/**
 * Card whose body folds away behind a small arrow in the top right corner.
 * The whole header row toggles it with the mouse; keyboard and screen
 * reader users get the arrow button, which carries the expanded state.
 */
export function CollapsibleCard({
  title,
  description,
  info,
  aside,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  contentClassName,
  children,
}: CollapsibleCardProps) {
  const { t } = useTranslation()
  const contentId = useId()
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen)
  const open = controlledOpen ?? uncontrolledOpen

  const toggle = () => {
    const next = !open
    if (controlledOpen === undefined) setUncontrolledOpen(next)
    onOpenChange?.(next)
  }

  return (
    <Card className="gap-0 py-0">
      <div
        className="flex cursor-pointer select-none items-center gap-3 px-6 py-4"
        onClick={toggle}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold leading-tight">{title}</h2>
            {info && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground"
                      aria-label={info.label}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Info className="size-4" aria-hidden="true" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-xs text-sm">
                    {info.text}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          {open && description && (
            <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {aside && <div className="flex shrink-0 items-center gap-2">{aside}</div>}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 shrink-0 text-muted-foreground"
          aria-expanded={open}
          aria-controls={contentId}
          aria-label={`${typeof title === 'string' ? `${title}: ` : ''}${
            open ? t('common.collapse') : t('common.expand')
          }`}
          onClick={(e) => {
            e.stopPropagation()
            toggle()
          }}
        >
          <ChevronDown
            className={cn('size-4 transition-transform duration-200', open && 'rotate-180')}
            aria-hidden="true"
          />
        </Button>
      </div>
      <div
        id={contentId}
        hidden={!open}
        className={cn('border-t px-6 pb-6 pt-5', contentClassName)}
      >
        {children}
      </div>
    </Card>
  )
}
