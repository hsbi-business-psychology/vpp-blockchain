import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Eye, Trash2, Upload, ShieldAlert, Wallet } from 'lucide-react'
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
