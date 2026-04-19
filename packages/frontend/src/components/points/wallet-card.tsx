import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Wallet,
  Copy,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Trash2,
  Upload,
  ChevronDown,
  ChevronUp,
  Info,
  Shield,
  Unplug,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { MnemonicHelpLink, MnemonicRevealDialog } from './wallet-dialogs'

interface WalletCardProps {
  address: string
  privateKey: string
  /** BIP-39 12-word recovery phrase for newly-created wallets; absent for legacy wallets and MetaMask. */
  mnemonic?: string
  isMetaMask: boolean
  onRevealRequest: () => void
  onImportRequest: () => void
  onDeleteRequest: () => void
  onDisconnect: () => void
  keyRevealed: boolean
  onHideKey: () => void
}

const HOLD_TO_REVEAL_MS = 3000

export function WalletCard({
  address,
  privateKey,
  mnemonic,
  isMetaMask,
  onRevealRequest,
  onImportRequest,
  onDeleteRequest,
  onDisconnect,
  keyRevealed,
  onHideKey,
}: WalletCardProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showMnemonicDialog, setShowMnemonicDialog] = useState(false)

  // Hold-to-reveal: visual progress 0..1 driven by requestAnimationFrame so
  // the user gets immediate, smooth feedback that something is happening.
  // Using rAF instead of CSS-only transition so we can cleanly cancel on
  // pointerup/cancel without races.
  const [holdProgress, setHoldProgress] = useState(0)
  const holdStartRef = useRef<number | null>(null)
  const holdRafRef = useRef<number | null>(null)

  function cancelHold() {
    holdStartRef.current = null
    if (holdRafRef.current !== null) {
      cancelAnimationFrame(holdRafRef.current)
      holdRafRef.current = null
    }
    setHoldProgress(0)
  }

  function tickHold(timestamp: number) {
    if (holdStartRef.current === null) return
    const elapsed = timestamp - holdStartRef.current
    const progress = Math.min(elapsed / HOLD_TO_REVEAL_MS, 1)
    setHoldProgress(progress)
    if (progress >= 1) {
      cancelHold()
      setShowMnemonicDialog(true)
      return
    }
    holdRafRef.current = requestAnimationFrame(tickHold)
  }

  function handleHoldStart() {
    if (holdStartRef.current !== null) return
    // requestAnimationFrame's first callback receives the current timestamp,
    // so we delay capturing the start until inside the rAF callback. That
    // sidesteps the react-hooks/purity rule, which forbids calling
    // `performance.now()` from anything that *might* be a render path.
    holdRafRef.current = requestAnimationFrame((ts) => {
      holdStartRef.current = ts
      tickHold(ts)
    })
  }

  // Always release any pending rAF on unmount so a quick navigate-away
  // doesn't leak callbacks.
  useEffect(() => cancelHold, [])

  function handleCopy(text: string) {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`flex size-9 shrink-0 items-center justify-center rounded-md ${
                isMetaMask ? 'bg-orange-500/10' : 'bg-primary/10'
              }`}
            >
              {isMetaMask ? (
                <Shield className="size-4 text-orange-500" aria-hidden="true" />
              ) : (
                <Wallet className="size-4 text-primary" aria-hidden="true" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">{t('wallet.title')}</p>
                <Badge variant="secondary" className="text-xs">
                  {isMetaMask ? t('wallet.metamask.connected') : t('wallet.connected')}
                </Badge>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <code className="truncate text-xs text-muted-foreground font-mono">
                  {address.slice(0, 6)}...{address.slice(-4)}
                </code>
                <button
                  onClick={() => handleCopy(address)}
                  className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={
                    copied ? t('common.copied', 'Kopiert') : t('wallet.copy', 'Adresse kopieren')
                  }
                >
                  {copied ? (
                    <Check className="size-3" aria-hidden="true" />
                  ) : (
                    <Copy className="size-3" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="shrink-0 text-xs text-muted-foreground"
            aria-expanded={expanded}
            aria-label={t('wallet.manage')}
          >
            <span className="hidden sm:inline">{t('wallet.manage')}</span>
            {expanded ? (
              <ChevronUp className="size-4 sm:ml-1 sm:size-3.5" aria-hidden="true" />
            ) : (
              <ChevronDown className="size-4 sm:ml-1 sm:size-3.5" aria-hidden="true" />
            )}
          </Button>
        </div>

        {expanded && (
          <div className="mt-4 space-y-4 border-t border-border pt-4">
            {/* Full address */}
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t('wallet.info.address')}
              </label>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded-md bg-muted px-3 py-2 font-mono text-xs">
                  {address}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() => handleCopy(address)}
                  aria-label={
                    copied ? t('common.copied', 'Kopiert') : t('wallet.copy', 'Adresse kopieren')
                  }
                >
                  {copied ? (
                    <Check className="size-3.5" aria-hidden="true" />
                  ) : (
                    <Copy className="size-3.5" aria-hidden="true" />
                  )}
                </Button>
              </div>
            </div>

            {/* Private key (only for local wallets) */}
            {!isMetaMask && (
              <div>
                <div className="mb-1 flex items-center gap-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    {t('wallet.info.privateKey')}
                  </label>
                  <InfoTip text={t('infoTips.privateKey')} label={t('wallet.info.privateKeyTip')} />
                </div>
                {keyRevealed ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <code className="flex-1 truncate rounded-md bg-destructive/5 border border-destructive/20 px-3 py-2 font-mono text-xs">
                        {privateKey}
                      </code>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => handleCopy(privateKey)}
                        aria-label={
                          copied
                            ? t('common.copied', 'Kopiert')
                            : t('wallet.copyKey', 'Private Key kopieren')
                        }
                      >
                        {copied ? (
                          <Check className="size-3.5" aria-hidden="true" />
                        ) : (
                          <Copy className="size-3.5" aria-hidden="true" />
                        )}
                      </Button>
                    </div>
                    <Button variant="outline" size="sm" onClick={onHideKey}>
                      <EyeOff className="mr-1.5 size-3.5" />
                      {t('wallet.reveal.hide')}
                    </Button>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" onClick={onRevealRequest}>
                    <Eye className="mr-1.5 size-3.5" />
                    {t('wallet.info.showKey')}
                  </Button>
                )}
              </div>
            )}

            {/* Recovery phrase (only for local wallets created with mnemonic) */}
            {!isMetaMask && mnemonic && (
              <div>
                <div className="mb-1 flex items-center gap-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    {t('wallet.mnemonic.settings.label')}
                  </label>
                  <InfoTip text={t('wallet.mnemonic.settings.tip')} />
                </div>
                <button
                  type="button"
                  onPointerDown={handleHoldStart}
                  onPointerUp={cancelHold}
                  onPointerLeave={cancelHold}
                  onPointerCancel={cancelHold}
                  onContextMenu={(e) => e.preventDefault()}
                  className="relative w-full overflow-hidden rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-left text-sm text-destructive transition-colors hover:bg-destructive/10"
                  aria-label={t('wallet.mnemonic.settings.holdButton')}
                  style={{ touchAction: 'none' }}
                >
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-y-0 left-0 bg-destructive/15 transition-[width] duration-75"
                    style={{ width: `${holdProgress * 100}%` }}
                  />
                  <span className="relative flex items-center gap-2">
                    <KeyRound className="size-3.5" aria-hidden="true" />
                    {t('wallet.mnemonic.settings.holdButton')}
                  </span>
                </button>
                <div className="mt-1 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-muted-foreground">
                    {t('wallet.mnemonic.settings.holdHint')}
                  </p>
                  <MnemonicHelpLink className="text-xs" newTab={false} />
                </div>
              </div>
            )}

            {/* Legacy hint for wallets without mnemonic */}
            {!isMetaMask && !mnemonic && (
              <div className="space-y-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                <p>{t('wallet.mnemonic.settings.legacyHint')}</p>
                <MnemonicHelpLink className="text-xs" newTab={false} />
              </div>
            )}

            <Separator />

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              {!isMetaMask && (
                <>
                  <Button variant="outline" size="sm" onClick={onImportRequest}>
                    <Upload className="mr-1.5 size-3.5" aria-hidden="true" />
                    {t('wallet.import.importAnother')}
                  </Button>
                  <Button variant="destructive" size="sm" onClick={onDeleteRequest}>
                    <Trash2 className="mr-1.5 size-3.5" aria-hidden="true" />
                    {t('wallet.delete.button')}
                  </Button>
                </>
              )}
              {isMetaMask && (
                <Button variant="outline" size="sm" onClick={onDisconnect}>
                  <Unplug className="mr-1.5 size-3.5" aria-hidden="true" />
                  {t('wallet.metamask.disconnect')}
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
      {mnemonic && (
        <MnemonicRevealDialog
          open={showMnemonicDialog}
          onOpenChange={setShowMnemonicDialog}
          mnemonic={mnemonic}
          mode="view"
        />
      )}
    </Card>
  )
}

function InfoTip({ text, label }: { text: string; label?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className="inline-flex size-5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
          aria-label={label ?? text}
        >
          <Info className="size-3.5" aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs">
        {text}
      </TooltipContent>
    </Tooltip>
  )
}
