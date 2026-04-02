import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ethers } from 'ethers'
import {
  Search,
  Loader2,
  Info,
  GraduationCap,
  CheckCircle2,
  XCircle,
  Award,
  Undo2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useApi } from '@/hooks/use-api'
import { useWallet } from '@/hooks/use-wallet'

interface SearchResult {
  address: string
  totalPoints: number
  submitted: boolean
}

export function SubmissionManagement() {
  const { t } = useTranslation()
  const { wallet, sign } = useWallet()
  const { getWalletSubmissionStatus, markWalletSubmitted, unmarkWalletSubmitted } = useApi()

  const [searchAddress, setSearchAddress] = useState('')
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [result, setResult] = useState<SearchResult | null>(null)

  const [confirmAction, setConfirmAction] = useState<'mark' | 'unmark' | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  const handleSearch = async () => {
    const addr = searchAddress.trim()
    if (!ethers.isAddress(addr)) {
      setSearchError(t('admin.submissions.invalidAddress'))
      return
    }
    setSearchError('')
    setSearchLoading(true)
    try {
      const data = await getWalletSubmissionStatus(addr)
      setResult(data)
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setSearchLoading(false)
    }
  }

  const handleConfirm = async () => {
    if (!result || !wallet || !confirmAction) return
    setActionLoading(true)
    try {
      const timestamp = Math.floor(Date.now() / 1000)
      const verb = confirmAction === 'mark' ? 'Mark' : 'Unmark'
      const message = `${verb} wallet ${result.address} by ${wallet.address} at ${timestamp}`
      const signature = await sign(message)

      if (confirmAction === 'mark') {
        await markWalletSubmitted(result.address, signature, message)
        toast.success(t('admin.submissions.markSuccess'))
      } else {
        await unmarkWalletSubmitted(result.address, signature, message)
        toast.success(t('admin.submissions.unmarkSuccess'))
      }

      setConfirmAction(null)

      const updated = await getWalletSubmissionStatus(result.address)
      setResult(updated)
    } catch (err) {
      const key =
        confirmAction === 'mark' ? 'admin.submissions.markError' : 'admin.submissions.unmarkError'
      toast.error(err instanceof Error ? err.message : t(key))
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">{t('admin.submissions.title')}</CardTitle>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="text-muted-foreground hover:text-foreground" aria-label="Info">
                    <Info className="size-4" aria-hidden="true" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs text-sm">
                  {t('admin.submissions.infoTip')}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <CardDescription>{t('admin.submissions.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              placeholder={t('admin.submissions.searchPlaceholder')}
              value={searchAddress}
              onChange={(e) => setSearchAddress(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="font-mono sm:flex-1"
              aria-label={t('admin.submissions.searchPlaceholder')}
              autoComplete="off"
            />
            <Button onClick={handleSearch} disabled={searchLoading || !searchAddress.trim()}>
              {searchLoading ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Search className="mr-2 size-4" />
              )}
              {t('admin.submissions.search')}
            </Button>
          </div>

          {searchError && (
            <p className="text-sm text-destructive" role="alert">
              {searchError}
            </p>
          )}

          {result && (
            <div className="rounded-lg border border-border">
              <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${
                      result.submitted ? 'bg-green-500/10' : 'bg-muted'
                    }`}
                  >
                    <GraduationCap
                      className={`size-5 ${
                        result.submitted ? 'text-green-500' : 'text-muted-foreground'
                      }`}
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-mono text-sm">{result.address}</p>
                    <div className="mt-1 flex items-center gap-3">
                      <span className="flex items-center gap-1 text-sm">
                        <Award className="size-3.5 text-primary" />
                        <span className="font-semibold">{result.totalPoints}</span>
                        <span className="text-muted-foreground">
                          {t('admin.submissions.points')}
                        </span>
                      </span>
                      <Badge
                        variant={result.submitted ? 'default' : 'secondary'}
                        className={`text-xs ${
                          result.submitted
                            ? 'bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/20'
                            : ''
                        }`}
                      >
                        {result.submitted ? (
                          <CheckCircle2 className="mr-1 size-3" />
                        ) : (
                          <XCircle className="mr-1 size-3" />
                        )}
                        {result.submitted
                          ? t('admin.submissions.submitted')
                          : t('admin.submissions.notSubmitted')}
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className="shrink-0">
                  {result.submitted ? (
                    <Button variant="outline" size="sm" onClick={() => setConfirmAction('unmark')}>
                      <Undo2 className="mr-1.5 size-3.5" />
                      {t('admin.submissions.unmarkSubmitted')}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => setConfirmAction('mark')}
                      className="bg-green-600 hover:bg-green-700 text-white"
                    >
                      <CheckCircle2 className="mr-1.5 size-3.5" />
                      {t('admin.submissions.markSubmitted')}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}

          {!result && !searchError && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {t('admin.submissions.noResults')}
            </p>
          )}
        </CardContent>
      </Card>

      {/* ─── Confirmation Dialog ─── */}
      <Dialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
        <DialogContent>
          <DialogHeader>
            <div
              className={`flex size-12 items-center justify-center rounded-lg mb-2 ${
                confirmAction === 'mark' ? 'bg-green-500/10' : 'bg-amber-500/10'
              }`}
            >
              {confirmAction === 'mark' ? (
                <CheckCircle2 className="size-6 text-green-600" />
              ) : (
                <Undo2 className="size-6 text-amber-600" />
              )}
            </div>
            <DialogTitle>
              {confirmAction === 'mark'
                ? t('admin.submissions.confirmMark.title')
                : t('admin.submissions.confirmUnmark.title')}
            </DialogTitle>
            <DialogDescription>
              {confirmAction === 'mark'
                ? t('admin.submissions.confirmMark.description')
                : t('admin.submissions.confirmUnmark.description')}
            </DialogDescription>
          </DialogHeader>
          {result && (
            <div className="rounded-lg bg-muted p-3 space-y-1">
              <p className="truncate font-mono text-sm">{result.address}</p>
              <p className="text-xs text-muted-foreground">
                {result.totalPoints} {t('admin.submissions.points')}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmAction(null)}
              disabled={actionLoading}
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={actionLoading}
              className={
                confirmAction === 'mark' ? 'bg-green-600 hover:bg-green-700 text-white' : ''
              }
              variant={confirmAction === 'unmark' ? 'default' : undefined}
            >
              {actionLoading && <Loader2 className="mr-1.5 size-4 animate-spin" />}
              {confirmAction === 'mark'
                ? t('admin.submissions.confirmMark.button')
                : t('admin.submissions.confirmUnmark.button')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
