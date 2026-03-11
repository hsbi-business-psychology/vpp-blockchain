import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ExternalLink,
  Loader2,
  Wallet,
  Copy,
  Check,
  Eye,
  EyeOff,
  Download,
  Trash2,
  Search,
  Info,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
  Upload,
  Award,
  ClipboardCheck,
  Gift,
  BarChart3,
  CheckCircle2,
  Unplug,
  Globe,
  Shield,
  KeyRound,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useWallet } from '@/hooks/use-wallet'
import { useBlockchain } from '@/hooks/use-blockchain'
import { getTxUrl } from '@/lib/config'
import { toast } from 'sonner'
import { ethers } from 'ethers'

export default function PointsPage() {
  const { t } = useTranslation()
  const { wallet, hasWallet, isMetaMask, hasMetaMask, loading: walletLoading, create, importKey, connectMetaMask, remove, downloadKey } = useWallet()
  const { getTotalPoints, getClaimHistory, isWalletSubmitted: checkSubmitted, loading } = useBlockchain()

  const [totalPoints, setTotalPoints] = useState<number | null>(null)
  const [walletSubmitted, setWalletSubmitted] = useState(false)
  const [history, setHistory] = useState<
    Array<{ surveyId: number; points: number; txHash: string; blockNumber: number }>
  >([])

  const [walletExpanded, setWalletExpanded] = useState(false)
  const [showRevealDialog, setShowRevealDialog] = useState(false)
  const [revealChecks, setRevealChecks] = useState([false, false, false])
  const [keyRevealed, setKeyRevealed] = useState(false)

  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  const [showImportDialog, setShowImportDialog] = useState(false)
  const [importValue, setImportValue] = useState('')

  const [copied, setCopied] = useState(false)

  const [searchAddress, setSearchAddress] = useState('')
  const [searchPoints, setSearchPoints] = useState<number | null>(null)
  const [searchHistory, setSearchHistory] = useState<
    Array<{ surveyId: number; points: number; txHash: string; blockNumber: number }>
  >([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState('')

  useEffect(() => {
    if (!wallet?.address) return

    getTotalPoints(wallet.address)
      .then(setTotalPoints)
      .catch(() => {})

    checkSubmitted(wallet.address)
      .then(setWalletSubmitted)
      .catch(() => {})

    getClaimHistory(wallet.address)
      .then(setHistory)
      .catch(() => {})
  }, [wallet?.address, getTotalPoints, getClaimHistory, checkSubmitted])

  function handleCopy(text: string) {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleCreate() {
    create()
    toast.success(t('wallet.create.success'))
  }

  function handleImport() {
    try {
      importKey(importValue.trim())
      setImportValue('')
      setShowImportDialog(false)
      toast.success(t('wallet.create.success'))
    } catch {
      toast.error(t('wallet.import.error'))
    }
  }

  async function handleConnectMetaMask() {
    try {
      await connectMetaMask()
      toast.success(t('wallet.create.success'))
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('common.error')
      if (msg.includes('not installed')) {
        toast.error(t('wallet.metamask.notInstalled'))
      } else {
        toast.error(msg)
      }
    }
  }

  function handleDisconnect() {
    remove()
    setTotalPoints(null)
    setHistory([])
    setWalletExpanded(false)
    toast.success(t('wallet.delete.success'))
  }

  function handleDelete() {
    remove()
    setTotalPoints(null)
    setHistory([])
    setShowDeleteDialog(false)
    setKeyRevealed(false)
    setWalletExpanded(false)
    toast.success(t('wallet.delete.success'))
  }

  function handleRevealRequest() {
    setRevealChecks([false, false, false])
    setShowRevealDialog(true)
  }

  function handleRevealConfirm() {
    setKeyRevealed(true)
    setShowRevealDialog(false)
  }

  function handleHideKey() {
    setKeyRevealed(false)
  }

  async function handleSearch() {
    const addr = searchAddress.trim()
    if (!ethers.isAddress(addr)) {
      setSearchError(t('points.explorer.invalidAddress'))
      return
    }
    setSearchError('')
    setSearchLoading(true)
    try {
      const [pts, hist] = await Promise.all([
        getTotalPoints(addr),
        getClaimHistory(addr),
      ])
      setSearchPoints(pts)
      setSearchHistory(hist)
    } catch {
      setSearchError(t('common.error'))
    } finally {
      setSearchLoading(false)
    }
  }

  if (walletLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 py-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('points.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground sm:text-base">{t('points.subtitle')}</p>
      </div>

      {!hasWallet ? (
        /* ─── No Wallet: Choose Method ─── */
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">{t('wallet.chooseMethod')}</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {/* Browser Wallet */}
            <Card className="relative flex flex-col">
              <CardHeader className="flex-1 pb-3">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Globe className="size-5 text-primary" aria-hidden="true" />
                  </div>
                  <div>
                    <CardTitle className="text-base">{t('wallet.browser.title')}</CardTitle>
                    <Badge variant="secondary" className="mt-0.5 text-xs">{t('wallet.browser.tag')}</Badge>
                  </div>
                </div>
                <CardDescription className="mt-3 text-sm leading-relaxed">
                  {t('wallet.browser.description')}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <Button onClick={handleCreate} className="w-full">
                  <Wallet className="mr-2 size-4" aria-hidden="true" />
                  {t('wallet.browser.button')}
                </Button>
              </CardContent>
            </Card>

            {/* MetaMask */}
            <Card className="relative flex flex-col">
              <CardHeader className="flex-1 pb-3">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-orange-500/10">
                    <Shield className="size-5 text-orange-500" aria-hidden="true" />
                  </div>
                  <div>
                    <CardTitle className="text-base">{t('wallet.metamask.title')}</CardTitle>
                    <Badge variant="outline" className="mt-0.5 border-orange-500/30 text-xs text-orange-600 dark:text-orange-400">{t('wallet.metamask.tag')}</Badge>
                  </div>
                </div>
                <CardDescription className="mt-3 text-sm leading-relaxed">
                  {t('wallet.metamask.description')}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                {hasMetaMask ? (
                  <Button variant="outline" onClick={handleConnectMetaMask} className="w-full">
                    <Shield className="mr-2 size-4" aria-hidden="true" />
                    {t('wallet.metamask.button')}
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <Button variant="outline" disabled className="w-full opacity-60">
                      <Shield className="mr-2 size-4" aria-hidden="true" />
                      {t('wallet.metamask.notInstalled')}
                    </Button>
                    <p className="text-center text-xs text-muted-foreground">
                      {t('wallet.metamask.installHint')}{' '}
                      <a href="https://metamask.io" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                        {t('wallet.metamask.installLink')}
                      </a>
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Import */}
            <Card className="relative flex flex-col">
              <CardHeader className="flex-1 pb-3">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <KeyRound className="size-5 text-muted-foreground" aria-hidden="true" />
                  </div>
                  <div>
                    <CardTitle className="text-base">{t('wallet.import.title')}</CardTitle>
                    <Badge variant="secondary" className="mt-0.5 text-xs">{t('wallet.import.tag')}</Badge>
                  </div>
                </div>
                <CardDescription className="mt-3 text-sm leading-relaxed">
                  {t('wallet.import.description')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                <Input
                  value={importValue}
                  onChange={(e) => setImportValue(e.target.value)}
                  placeholder={t('wallet.import.placeholder')}
                  type="password"
                  className="font-mono text-xs"
                  aria-label={t('wallet.import.title', 'Private Key')}
                  autoComplete="off"
                />
                <Button variant="outline" onClick={handleImport} disabled={!importValue.trim()} className="w-full">
                  <Upload className="mr-2 size-4" aria-hidden="true" />
                  {t('wallet.import.button')}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <>
          {/* ─── Wallet Card (Compact) ─── */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`flex size-9 shrink-0 items-center justify-center rounded-md ${isMetaMask ? 'bg-orange-500/10' : 'bg-primary/10'}`}>
                    {isMetaMask ? <Shield className="size-4 text-orange-500" aria-hidden="true" /> : <Wallet className="size-4 text-primary" aria-hidden="true" />}
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
                        {wallet!.address.slice(0, 6)}...{wallet!.address.slice(-4)}
                      </code>
                      <button
                        onClick={() => handleCopy(wallet!.address)}
                        className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                        aria-label={copied ? t('common.copied', 'Kopiert') : t('wallet.copy', 'Adresse kopieren')}
                      >
                        {copied ? <Check className="size-3" aria-hidden="true" /> : <Copy className="size-3" aria-hidden="true" />}
                      </button>
                    </div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setWalletExpanded(!walletExpanded)}
                  className="shrink-0 text-xs text-muted-foreground"
                  aria-expanded={walletExpanded}
                  aria-label={t('wallet.manage')}
                >
                  <span className="hidden sm:inline">{t('wallet.manage')}</span>
                  {walletExpanded ? <ChevronUp className="size-4 sm:ml-1 sm:size-3.5" aria-hidden="true" /> : <ChevronDown className="size-4 sm:ml-1 sm:size-3.5" aria-hidden="true" />}
                </Button>
              </div>

              {walletExpanded && (
                <div className="mt-4 space-y-4 border-t border-border pt-4">
                  {/* Full address */}
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      {t('wallet.info.address')}
                    </label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 truncate rounded-md bg-muted px-3 py-2 font-mono text-xs">
                        {wallet!.address}
                      </code>
                      <Button variant="ghost" size="icon" className="size-8" onClick={() => handleCopy(wallet!.address)} aria-label={copied ? t('common.copied', 'Kopiert') : t('wallet.copy', 'Adresse kopieren')}>
                        {copied ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
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
                        <InfoTip text={t('infoTips.privateKey')} />
                      </div>
                      {keyRevealed ? (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <code className="flex-1 truncate rounded-md bg-destructive/5 border border-destructive/20 px-3 py-2 font-mono text-xs">
                              {wallet!.privateKey}
                            </code>
                            <Button variant="ghost" size="icon" className="size-8" onClick={() => handleCopy(wallet!.privateKey)} aria-label={copied ? t('common.copied', 'Kopiert') : t('wallet.copyKey', 'Private Key kopieren')}>
                              {copied ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
                            </Button>
                          </div>
                          <Button variant="outline" size="sm" onClick={handleHideKey}>
                            <EyeOff className="mr-1.5 size-3.5" />
                            {t('wallet.reveal.hide')}
                          </Button>
                        </div>
                      ) : (
                        <Button variant="outline" size="sm" onClick={handleRevealRequest}>
                          <Eye className="mr-1.5 size-3.5" />
                          {t('wallet.info.showKey')}
                        </Button>
                      )}
                    </div>
                  )}

                  <Separator />

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2">
                    {!isMetaMask && (
                      <>
                        <Button variant="outline" size="sm" onClick={downloadKey}>
                          <Download className="mr-1.5 size-3.5" aria-hidden="true" />
                          {t('wallet.info.downloadKey')}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => { setImportValue(''); setShowImportDialog(true) }}>
                          <Upload className="mr-1.5 size-3.5" aria-hidden="true" />
                          {t('wallet.import.importAnother')}
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => setShowDeleteDialog(true)}>
                          <Trash2 className="mr-1.5 size-3.5" aria-hidden="true" />
                          {t('wallet.delete.button')}
                        </Button>
                      </>
                    )}
                    {isMetaMask && (
                      <Button variant="outline" size="sm" onClick={handleDisconnect}>
                        <Unplug className="mr-1.5 size-3.5" aria-hidden="true" />
                        {t('wallet.metamask.disconnect')}
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ─── Points Overview ─── */}
          <div className="flex items-center gap-4 rounded-lg border border-border bg-card p-4 sm:p-5">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 sm:size-14">
              <Award className="size-6 text-primary sm:size-7" />
            </div>
            <div>
              <p className="text-4xl font-bold leading-none sm:text-5xl">
                {loading && totalPoints === null ? (
                  <Loader2 className="size-8 animate-spin" />
                ) : (
                  totalPoints ?? 0
                )}
              </p>
              <p className="mt-1 text-sm text-muted-foreground sm:text-base">{t('points.total')}</p>
            </div>
          </div>

          {/* ─── Submitted Banner ─── */}
          {walletSubmitted && (
            <div className="flex items-start gap-3 rounded-lg border border-green-500/20 bg-green-500/5 p-4">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-green-500/10">
                <CheckCircle2 className="size-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="font-semibold text-green-700 dark:text-green-400">
                  {t('points.submittedBanner.title')}
                </p>
                <p className="mt-0.5 text-sm text-green-600/80 dark:text-green-400/80">
                  {t('points.submittedBanner.description')}
                </p>
              </div>
            </div>
          )}

          {/* ─── How It Works (visible when no points yet or on first visit) ─── */}
          {history.length === 0 && !loading && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t('points.howItWorks.title')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-3">
                  {[
                    { icon: ClipboardCheck, color: 'text-blue-500', bg: 'bg-blue-500/10', titleKey: 'points.howItWorks.step1title', textKey: 'points.howItWorks.step1text', step: '1' },
                    { icon: Gift, color: 'text-green-500', bg: 'bg-green-500/10', titleKey: 'points.howItWorks.step2title', textKey: 'points.howItWorks.step2text', step: '2' },
                    { icon: BarChart3, color: 'text-primary', bg: 'bg-primary/10', titleKey: 'points.howItWorks.step3title', textKey: 'points.howItWorks.step3text', step: '3' },
                  ].map(({ icon: Icon, color, bg, titleKey, textKey, step }) => (
                    <div key={step} className="flex gap-3 sm:flex-col sm:items-center sm:text-center">
                      <div className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${bg} sm:size-12`}>
                        <Icon className={`size-5 ${color} sm:size-6`} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold sm:mt-2">{t(titleKey)}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">{t(textKey)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* ─── Claim History ─── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t('points.history')}</CardTitle>
              {history.length > 0 && (
                <CardDescription>{t('points.historyDescription')}</CardDescription>
              )}
            </CardHeader>
            <CardContent>
              {loading && history.length === 0 ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : history.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">{t('points.empty')}</p>
              ) : (
                <>
                  {/* Desktop table */}
                  <div className="hidden overflow-x-auto sm:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t('points.table.surveyId')}</TableHead>
                          <TableHead className="text-right">{t('points.table.points')}</TableHead>
                          <TableHead>{t('points.table.tx')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {history.map((entry) => (
                          <TableRow key={entry.txHash}>
                            <TableCell className="font-medium">#{entry.surveyId}</TableCell>
                            <TableCell className="text-right font-semibold">{entry.points}</TableCell>
                            <TableCell>
                              <a
                                href={getTxUrl(entry.txHash)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                              >
                                {entry.txHash.slice(0, 10)}...
                                <ExternalLink className="size-3" aria-hidden="true" />
                                <span className="sr-only">{t('points.table.viewTx', 'Transaktion anzeigen')}</span>
                              </a>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {/* Mobile cards */}
                  <div className="space-y-2 sm:hidden">
                    {history.map((entry) => (
                      <div key={entry.txHash} className="flex items-center justify-between rounded-lg border border-border p-3">
                        <div>
                          <p className="text-sm font-medium">#{entry.surveyId}</p>
                          <a
                            href={getTxUrl(entry.txHash)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            {entry.txHash.slice(0, 10)}...
                            <ExternalLink className="size-3" aria-hidden="true" />
                          </a>
                        </div>
                        <Badge variant="secondary" className="text-sm font-semibold">
                          +{entry.points}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* ─── Explorer / Wallet Search ─── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Search className="size-5 text-muted-foreground" />
            <CardTitle className="text-lg">{t('points.explorer.title')}</CardTitle>
          </div>
          <CardDescription>{t('points.explorer.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={searchAddress}
              onChange={(e) => setSearchAddress(e.target.value)}
              placeholder={t('points.explorer.placeholder')}
              className="font-mono text-xs"
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              aria-label={t('points.explorer.title')}
              autoComplete="off"
            />
            <Button onClick={handleSearch} disabled={searchLoading} className="shrink-0">
              {searchLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                t('points.explorer.search')
              )}
            </Button>
          </div>
          {searchError && <p className="text-sm text-destructive" role="alert">{searchError}</p>}
          {searchPoints !== null && (
            <div className="space-y-3 border-t border-border pt-4">
              <div className="flex items-center gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10">
                  <Award className="size-4 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold leading-none">{searchPoints}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t('points.total')}</p>
                </div>
              </div>
              {searchHistory.length > 0 && (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('points.table.surveyId')}</TableHead>
                        <TableHead className="text-right">{t('points.table.points')}</TableHead>
                        <TableHead>{t('points.table.tx')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {searchHistory.map((entry) => (
                        <TableRow key={entry.txHash}>
                          <TableCell className="font-medium">#{entry.surveyId}</TableCell>
                          <TableCell className="text-right font-semibold">{entry.points}</TableCell>
                          <TableCell>
                            <a
                              href={getTxUrl(entry.txHash)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                            >
                              {entry.txHash.slice(0, 10)}...
                              <ExternalLink className="size-3" />
                            </a>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Private Key Reveal Dialog ─── */}
      <Dialog open={showRevealDialog} onOpenChange={setShowRevealDialog}>
        <DialogContent>
          <DialogHeader>
            <div className="flex size-12 items-center justify-center rounded-lg bg-destructive/10 mb-2">
              <ShieldAlert className="size-6 text-destructive" />
            </div>
            <DialogTitle>{t('wallet.reveal.title')}</DialogTitle>
            <DialogDescription>{t('wallet.reveal.description')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {[t('wallet.reveal.check1'), t('wallet.reveal.check2'), t('wallet.reveal.check3')].map((text, i) => (
              <label key={i} className="flex items-start gap-3 cursor-pointer rounded-lg border border-border p-3 transition-colors hover:bg-muted/50">
                <input
                  type="checkbox"
                  checked={revealChecks[i]}
                  onChange={() => {
                    const next = [...revealChecks]
                    next[i] = !next[i]
                    setRevealChecks(next)
                  }}
                  className="mt-0.5 size-4 rounded accent-primary"
                />
                <span className="text-sm">{text}</span>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRevealDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={!revealChecks.every(Boolean)}
              onClick={handleRevealConfirm}
            >
              <Eye className="mr-1.5 size-4" />
              {t('wallet.reveal.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete Confirmation Dialog ─── */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
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
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="mr-1.5 size-4" />
              {t('wallet.delete.confirmButton')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Import Dialog ─── */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent>
          <DialogHeader>
            <div className="flex size-12 items-center justify-center rounded-lg bg-primary/10 mb-2">
              <Upload className="size-6 text-primary" />
            </div>
            <DialogTitle>{t('wallet.import.title')}</DialogTitle>
            <DialogDescription>{t('wallet.import.description')}</DialogDescription>
          </DialogHeader>
          {hasWallet && (
            <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-3">
              <p className="text-sm text-amber-600 dark:text-amber-400">{t('wallet.reset.warning')}</p>
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
            <Button variant="outline" onClick={() => setShowImportDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleImport} disabled={!importValue.trim()}>
              <Upload className="mr-1.5 size-4" />
              {t('wallet.import.button')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function InfoTip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button className="inline-flex size-5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground" aria-label="Info">
          <Info className="size-3.5" aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs">
        {text}
      </TooltipContent>
    </Tooltip>
  )
}
