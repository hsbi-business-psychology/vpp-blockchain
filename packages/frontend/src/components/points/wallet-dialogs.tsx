import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy, Eye, EyeOff, KeyRound, ShieldAlert, Trash2, Upload, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { isValidPrivateKey } from '@/lib/wallet'
import { toast } from 'sonner'

// ---------------------------------------------------------------------------
// Reveal Private Key Dialog
// ---------------------------------------------------------------------------

interface RevealDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

export function RevealKeyDialog({ open, onOpenChange, onConfirm }: RevealDialogProps) {
  const { t } = useTranslation()
  const [checks, setChecks] = useState([false, false, false])

  function handleOpenChange(next: boolean) {
    if (!next) setChecks([false, false, false])
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="flex size-12 items-center justify-center rounded-lg bg-destructive/10 mb-2">
            <ShieldAlert className="size-6 text-destructive" />
          </div>
          <DialogTitle>{t('wallet.reveal.title')}</DialogTitle>
          <DialogDescription>{t('wallet.reveal.description')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {[t('wallet.reveal.check1'), t('wallet.reveal.check2'), t('wallet.reveal.check3')].map(
            (text, i) => (
              <label
                key={i}
                className="flex items-start gap-3 cursor-pointer rounded-lg border border-border p-3 transition-colors hover:bg-muted/50"
              >
                <input
                  type="checkbox"
                  checked={checks[i]}
                  onChange={() => {
                    const next = [...checks]
                    next[i] = !next[i]
                    setChecks(next)
                  }}
                  className="mt-0.5 size-4 rounded accent-primary"
                />
                <span className="text-sm">{text}</span>
              </label>
            ),
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="destructive"
            disabled={!checks.every(Boolean)}
            onClick={() => {
              onConfirm()
              setChecks([false, false, false])
            }}
          >
            <Eye className="mr-1.5 size-4" />
            {t('wallet.reveal.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Delete Wallet Dialog
// ---------------------------------------------------------------------------

interface DeleteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

export function DeleteWalletDialog({ open, onOpenChange, onConfirm }: DeleteDialogProps) {
  const { t } = useTranslation()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="flex size-12 items-center justify-center rounded-lg bg-destructive/10 mb-2">
            <Trash2 className="size-6 text-destructive" />
          </div>
          <DialogTitle>{t('wallet.delete.confirm')}</DialogTitle>
          <DialogDescription>{t('wallet.delete.confirmDescription')}</DialogDescription>
        </DialogHeader>
        <div className="rounded-lg bg-destructive/5 border border-destructive/20 p-3">
          <p className="text-sm text-destructive">{t('wallet.delete.description')}</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            <Trash2 className="mr-1.5 size-4" />
            {t('wallet.delete.confirmButton')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Import Wallet Dialog
// ---------------------------------------------------------------------------

interface ImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  hasExistingWallet: boolean
  onImport: (key: string) => void
}

export function ImportWalletDialog({
  open,
  onOpenChange,
  hasExistingWallet,
  onImport,
}: ImportDialogProps) {
  const { t } = useTranslation()
  const [importValue, setImportValue] = useState('')

  function handleOpenChange(next: boolean) {
    if (!next) setImportValue('')
    onOpenChange(next)
  }

  function handleImport() {
    const key = importValue.trim()
    if (!isValidPrivateKey(key)) {
      toast.error(t('wallet.import.error'))
      return
    }
    onImport(key)
    setImportValue('')
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="flex size-12 items-center justify-center rounded-lg bg-primary/10 mb-2">
            <Upload className="size-6 text-primary" />
          </div>
          <DialogTitle>{t('wallet.import.title')}</DialogTitle>
          <DialogDescription>{t('wallet.import.description')}</DialogDescription>
        </DialogHeader>
        {hasExistingWallet && (
          <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-3">
            <p className="text-sm text-amber-600 dark:text-amber-400">
              {t('wallet.reset.warning')}
            </p>
          </div>
        )}
        <div>
          <Input
            value={importValue}
            onChange={(e) => setImportValue(e.target.value)}
            placeholder={t('wallet.import.placeholder')}
            type="password"
            className="font-mono text-xs"
            aria-label={t('wallet.import.title', 'Private Key')}
            autoComplete="off"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleImport} disabled={!importValue.trim()}>
            <Upload className="mr-1.5 size-4" />
            {t('wallet.import.button')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Create Wallet Info Dialog
// ---------------------------------------------------------------------------

interface CreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

export function CreateWalletDialog({ open, onOpenChange, onConfirm }: CreateDialogProps) {
  const { t } = useTranslation()
  const [checks, setChecks] = useState([false, false, false])

  function handleOpenChange(next: boolean) {
    if (!next) setChecks([false, false, false])
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl gap-0 p-0">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <DialogTitle className="text-lg">{t('wallet.create.dialogTitle')}</DialogTitle>
            <DialogDescription className="mt-0.5">
              {t('wallet.create.dialogDescription')}
            </DialogDescription>
          </div>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-6 py-5">
          <div className="space-y-5">
            {[
              {
                title: t('wallet.create.dialogInfo1Title'),
                text: t('wallet.create.dialogInfo1Text'),
              },
              {
                title: t('wallet.create.dialogInfo2Title'),
                text: t('wallet.create.dialogInfo2Text'),
              },
              {
                title: t('wallet.create.dialogInfo3Title'),
                text: t('wallet.create.dialogInfo3Text'),
              },
              {
                title: t('wallet.create.dialogInfo4Title'),
                text: t('wallet.create.dialogInfo4Text'),
              },
            ].map(({ title, text }) => (
              <div key={title}>
                <p className="text-sm font-semibold">{title}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{text}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 space-y-1">
            {[
              t('wallet.create.dialogCheck1'),
              t('wallet.create.dialogCheck2'),
              t('wallet.create.dialogCheck3'),
            ].map((text, i) => (
              <label
                key={i}
                className="flex cursor-pointer items-start gap-3 rounded-lg p-2.5 transition-colors hover:bg-muted/50"
              >
                <input
                  type="checkbox"
                  checked={checks[i]}
                  onChange={() => {
                    const next = [...checks]
                    next[i] = !next[i]
                    setChecks(next)
                  }}
                  className="mt-0.5 size-4 shrink-0 rounded accent-primary"
                />
                <span className="text-sm">{text}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={!checks.every(Boolean)}
            onClick={() => {
              onConfirm()
              setChecks([false, false, false])
            }}
          >
            <Wallet className="mr-1.5 size-4" />
            {t('wallet.create.dialogConfirm')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Mnemonic Reveal Dialog
//
// Hardenings:
// * Default mode reveals exactly one word at a time (shoulder-surf safe).
// * Toggle to "show all" for users alone in a private setting.
// * Tab switch (visibilitychange) re-blurs every word immediately.
// * Each open word auto-hides after 30 s.
// * `user-select: none` + `print:hidden` to make accidental copy/print harder.
// * Optional "copy whole phrase" with 60 s auto-clear of the clipboard.
// ---------------------------------------------------------------------------

const REVEAL_AUTO_HIDE_MS = 30_000
const CLIPBOARD_AUTO_CLEAR_MS = 60_000

interface MnemonicRevealDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mnemonic: string
  /** `create` shows the "I've saved my phrase" continue button; `view` shows just "Close". */
  mode?: 'create' | 'view'
  /** Fired when the user confirms they've written the phrase down (create mode). */
  onContinue?: () => void
}

export function MnemonicRevealDialog({
  open,
  onOpenChange,
  mnemonic,
  mode = 'create',
  onContinue,
}: MnemonicRevealDialogProps) {
  const { t } = useTranslation()
  const words = useMemo(() => mnemonic.trim().split(/\s+/), [mnemonic])

  const [showAll, setShowAll] = useState(false)
  const [revealedSingle, setRevealedSingle] = useState<number | null>(null)
  // Per-word auto-hide timer in single-reveal mode.
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Clipboard auto-clear timer for the "copy all" button.
  const clipboardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }, [])

  // Reset state every time the dialog opens or closes.
  useEffect(() => {
    if (!open) {
      setShowAll(false)
      setRevealedSingle(null)
      clearHideTimer()
    }
  }, [open, clearHideTimer])

  // Re-blur on tab switch / window blur — protects against background-tab
  // screenshots and against the user briefly looking away.
  useEffect(() => {
    if (!open) return
    function handleVisibility() {
      if (document.visibilityState === 'hidden') {
        setShowAll(false)
        setRevealedSingle(null)
        clearHideTimer()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('blur', handleVisibility)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('blur', handleVisibility)
    }
  }, [open, clearHideTimer])

  // Auto-hide a single revealed word after the timeout.
  useEffect(() => {
    clearHideTimer()
    if (revealedSingle === null || showAll) return
    hideTimerRef.current = setTimeout(() => {
      setRevealedSingle(null)
    }, REVEAL_AUTO_HIDE_MS)
    return clearHideTimer
  }, [revealedSingle, showAll, clearHideTimer])

  function handleWordClick(index: number) {
    if (showAll) return
    setRevealedSingle((prev) => (prev === index ? null : index))
  }

  function handleToggleShowAll() {
    setShowAll((prev) => !prev)
    setRevealedSingle(null)
  }

  async function handleCopyAll() {
    try {
      await navigator.clipboard.writeText(mnemonic)
      toast.success(t('wallet.mnemonic.reveal.copied'), {
        description: t('wallet.mnemonic.reveal.copyWarning'),
      })
      // Best-effort auto-clear: only succeeds if the document still has
      // clipboard permissions when the timer fires; otherwise silently no-ops.
      if (clipboardTimerRef.current) clearTimeout(clipboardTimerRef.current)
      clipboardTimerRef.current = setTimeout(() => {
        navigator.clipboard.writeText('').catch(() => {})
      }, CLIPBOARD_AUTO_CLEAR_MS)
    } catch {
      toast.error(t('wallet.mnemonic.reveal.copyFailed'))
    }
  }

  function handleOpenChange(next: boolean) {
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <div className="mb-2 flex size-12 items-center justify-center rounded-lg bg-primary/10">
            <KeyRound className="size-6 text-primary" />
          </div>
          <DialogTitle>{t('wallet.mnemonic.reveal.title')}</DialogTitle>
          <DialogDescription>{t('wallet.mnemonic.reveal.description')}</DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-300">
          <p className="font-medium">{t('wallet.mnemonic.reveal.safetyTitle')}</p>
          <p className="mt-1 text-xs leading-relaxed">{t('wallet.mnemonic.reveal.safetyText')}</p>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {showAll ? t('wallet.mnemonic.reveal.modeAll') : t('wallet.mnemonic.reveal.modeSingle')}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleToggleShowAll}
            className="h-7 text-xs"
          >
            {showAll ? (
              <>
                <EyeOff className="mr-1.5 size-3.5" />
                {t('wallet.mnemonic.reveal.toggleSingle')}
              </>
            ) : (
              <>
                <Eye className="mr-1.5 size-3.5" />
                {t('wallet.mnemonic.reveal.toggleAll')}
              </>
            )}
          </Button>
        </div>

        <div
          className="mnemonic-grid grid grid-cols-3 gap-2 print:hidden"
          style={{ userSelect: 'none', WebkitUserSelect: 'none' } as React.CSSProperties}
        >
          {words.map((word, i) => {
            const visible = showAll || revealedSingle === i
            return (
              <button
                key={i}
                type="button"
                onClick={() => handleWordClick(i)}
                className={`group flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                  visible
                    ? 'border-primary/40 bg-primary/5'
                    : 'border-border bg-muted/40 hover:bg-muted/70'
                }`}
                aria-label={
                  visible
                    ? t('wallet.mnemonic.reveal.wordVisible', {
                        n: i + 1,
                        word,
                      })
                    : t('wallet.mnemonic.reveal.wordHidden', { n: i + 1 })
                }
              >
                <span className="w-5 shrink-0 select-none text-xs font-mono text-muted-foreground">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span
                  className={`flex-1 font-mono ${
                    visible
                      ? ''
                      : 'select-none text-transparent [text-shadow:_0_0_8px_rgba(0,0,0,0.6)]'
                  }`}
                >
                  {visible ? word : '••••••'}
                </span>
              </button>
            )
          })}
        </div>

        <p className="text-xs text-muted-foreground">
          {showAll
            ? t('wallet.mnemonic.reveal.autoHideAll')
            : t('wallet.mnemonic.reveal.autoHideSingle')}
        </p>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={handleCopyAll}
            className="w-full sm:w-auto"
          >
            <Copy className="mr-1.5 size-4" />
            {t('wallet.mnemonic.reveal.copyAllButton')}
          </Button>
          {mode === 'create' ? (
            <Button type="button" onClick={() => onContinue?.()} className="w-full sm:w-auto">
              {t('wallet.mnemonic.reveal.continueButton')}
            </Button>
          ) : (
            <Button type="button" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
              {t('common.close', 'Schließen')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
