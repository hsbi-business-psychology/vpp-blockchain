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
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  const { wallet, hasWallet, loading: walletLoading, create, importKey, remove, downloadKey } = useWallet()
  const { getTotalPoints, getClaimHistory, loading } = useBlockchain()

  const [totalPoints, setTotalPoints] = useState<number | null>(null)
  const [history, setHistory] = useState<
    Array<{ surveyId: number; points: number; txHash: string; blockNumber: number }>
  >([])
  const [showKey, setShowKey] = useState(false)
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
    const fetchData = async () => {
      try {
        const [points, claims] = await Promise.all([
          getTotalPoints(wallet.address),
          getClaimHistory(wallet.address),
        ])
        setTotalPoints(points)
        setHistory(claims)
      } catch {
        // handled by hook
      }
    }
    fetchData()
  }, [wallet?.address, getTotalPoints, getClaimHistory])

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
      toast.success(t('wallet.create.success'))
    } catch {
      toast.error(t('wallet.import.error'))
    }
  }

  function handleDelete() {
    remove()
    setTotalPoints(null)
    setHistory([])
    toast.success(t('wallet.delete.success'))
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
      <div className="mx-auto max-w-3xl space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <h1 className="text-2xl font-bold">{t('points.title')}</h1>

      {/* Wallet section */}
      {!hasWallet ? (
        <section className="space-y-6 border border-border p-6">
          <div className="flex items-center gap-2">
            <Wallet className="size-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">{t('wallet.title')}</h2>
            <InfoTip text={t('infoTips.wallet')} />
          </div>
          <p className="text-sm text-muted-foreground">{t('points.noWallet')}</p>

          <div className="space-y-4">
            <div>
              <h3 className="mb-2 text-sm font-semibold">{t('wallet.create.title')}</h3>
              <p className="mb-3 text-sm text-muted-foreground">{t('wallet.create.description')}</p>
              <Button onClick={handleCreate}>{t('wallet.create.button')}</Button>
            </div>
            <div className="border-t border-border pt-4">
              <h3 className="mb-2 text-sm font-semibold">{t('wallet.import.title')}</h3>
              <p className="mb-3 text-sm text-muted-foreground">{t('wallet.import.description')}</p>
              <div className="flex gap-2">
                <Input
                  value={importValue}
                  onChange={(e) => setImportValue(e.target.value)}
                  placeholder={t('wallet.import.placeholder')}
                  type="password"
                  className="font-mono text-xs"
                />
                <Button onClick={handleImport} disabled={!importValue.trim()}>
                  {t('wallet.import.button')}
                </Button>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <>
          {/* Wallet info */}
          <section className="space-y-4 border border-border p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wallet className="size-5 text-primary" />
                <h2 className="text-lg font-semibold">{t('wallet.title')}</h2>
                <InfoTip text={t('infoTips.wallet')} />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t('wallet.info.address')}
              </label>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded bg-muted px-3 py-2 font-mono text-xs">
                  {wallet!.address}
                </code>
                <Button variant="ghost" size="icon" className="size-8" onClick={() => handleCopy(wallet!.address)}>
                  {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                </Button>
              </div>
            </div>

            <div>
              <div className="mb-1 flex items-center gap-1">
                <label className="text-xs font-medium text-muted-foreground">
                  {t('wallet.info.privateKey')}
                </label>
                <InfoTip text={t('infoTips.privateKey')} />
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded bg-muted px-3 py-2 font-mono text-xs">
                  {showKey ? wallet!.privateKey : '••••••••••••••••••••'}
                </code>
                <Button variant="ghost" size="icon" className="size-8" onClick={() => setShowKey(!showKey)}>
                  {showKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </Button>
              </div>
              <p className="mt-2 text-xs text-destructive">{t('wallet.info.warning')}</p>
            </div>

            <div className="flex gap-2 border-t border-border pt-4">
              <Button variant="outline" size="sm" onClick={downloadKey}>
                <Download className="mr-1.5 size-3.5" />
                {t('wallet.info.downloadKey')}
              </Button>
              <Button variant="destructive" size="sm" onClick={handleDelete}>
                <Trash2 className="mr-1.5 size-3.5" />
                {t('wallet.delete.button')}
              </Button>
            </div>
          </section>

          {/* Points */}
          <section className="space-y-4 border border-border p-6">
            <h2 className="text-lg font-semibold">{t('points.total')}</h2>
            <p className="text-4xl font-bold">
              {loading && totalPoints === null ? (
                <Loader2 className="size-8 animate-spin" />
              ) : (
                totalPoints ?? 0
              )}
            </p>
          </section>

          {/* History */}
          <section className="space-y-4 border border-border p-6">
            <h2 className="text-lg font-semibold">{t('points.history')}</h2>
            {loading && history.length === 0 ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : history.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">{t('points.empty')}</p>
            ) : (
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
                    {history.map((entry) => (
                      <TableRow key={entry.txHash}>
                        <TableCell className="font-medium">{entry.surveyId}</TableCell>
                        <TableCell className="text-right">{entry.points}</TableCell>
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
          </section>
        </>
      )}

      {/* Explorer / Wallet search */}
      <section className="space-y-4 border border-border p-6">
        <div className="flex items-center gap-2">
          <Search className="size-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">{t('points.explorer.title')}</h2>
        </div>
        <p className="text-sm text-muted-foreground">{t('points.explorer.description')}</p>
        <div className="flex gap-2">
          <Input
            value={searchAddress}
            onChange={(e) => setSearchAddress(e.target.value)}
            placeholder={t('points.explorer.placeholder')}
            className="font-mono text-xs"
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <Button onClick={handleSearch} disabled={searchLoading}>
            {searchLoading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              t('points.explorer.search')
            )}
          </Button>
        </div>
        {searchError && <p className="text-sm text-destructive">{searchError}</p>}
        {searchPoints !== null && (
          <div className="space-y-3 border-t border-border pt-4">
            <p className="text-sm">
              <span className="text-muted-foreground">{t('points.total')}:</span>{' '}
              <span className="text-xl font-bold">{searchPoints}</span>
            </p>
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
                        <TableCell className="font-medium">{entry.surveyId}</TableCell>
                        <TableCell className="text-right">{entry.points}</TableCell>
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
      </section>
    </div>
  )
}

function InfoTip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button className="inline-flex size-5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground">
          <Info className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs">
        {text}
      </TooltipContent>
    </Tooltip>
  )
}
