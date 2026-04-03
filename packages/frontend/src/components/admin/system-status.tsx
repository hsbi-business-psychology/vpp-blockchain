import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Wallet,
  Activity,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Info,
  Loader2,
  CheckCircle2,
  Fuel,
  Hash,
  Globe,
  Copy,
} from 'lucide-react'
import { toast } from 'sonner'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Skeleton } from '@/components/ui/skeleton'
import { useApi } from '@/hooks/use-api'
import { config } from '@/lib/config'

interface SystemStatusProps {
  adminSignature: string
  adminMessage: string
}

interface StatusData {
  minterAddress: string
  balance: string
  lowBalance: boolean
  gasPrice: string
  estimates: {
    claimsRemaining: number
    registrationsRemaining: number
    costPerClaim: string
    costPerRegistration: string
  }
  blockchain: {
    network: string
    blockNumber: number
  }
}

export function SystemStatus({ adminSignature, adminMessage }: SystemStatusProps) {
  const { t } = useTranslation()
  const { getSystemStatus } = useApi()
  const [status, setStatus] = useState<StatusData | null>(null)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [error, setError] = useState(false)

  const fetchStatus = useCallback(async () => {
    if (!adminSignature || !adminMessage) return
    setLoading(true)
    setError(false)
    try {
      const data = await getSystemStatus(adminSignature, adminMessage)
      setStatus(data)
      if (data.lowBalance) {
        setExpanded(true)
      }
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [adminSignature, adminMessage, getSystemStatus])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  const copyAddress = (address: string) => {
    navigator.clipboard.writeText(address)
    toast.success(t('common.copied'))
  }

  const explorerUrl = status?.minterAddress
    ? `${config.explorerUrl}/address/${status.minterAddress}`
    : null

  return (
    <div className="rounded-lg border border-border bg-card">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-muted/50"
        aria-expanded={expanded}
        aria-controls="system-status-details"
      >
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-md bg-muted">
            <Activity className="size-4 text-muted-foreground" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">{t('admin.systemStatus.title')}</h3>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-help" aria-label={t('admin.systemStatus.infoLabel')}>
                      <Info className="size-3.5 text-muted-foreground" aria-hidden="true" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs text-xs">
                    {t('admin.systemStatus.infoTip')}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <p className="text-xs text-muted-foreground">{t('admin.systemStatus.description')}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {loading && (
            <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />
          )}
          {status && !loading && (
            <div className="flex items-center gap-1.5">
              {status.lowBalance ? (
                <AlertTriangle className="size-4 text-amber-500" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="size-4 text-emerald-500" aria-hidden="true" />
              )}
              <span
                className={`text-xs font-medium ${
                  status.lowBalance ? 'text-amber-500' : 'text-emerald-500'
                }`}
              >
                {parseFloat(status.balance).toFixed(6)} ETH
              </span>
            </div>
          )}
          {error && !loading && (
            <span className="text-xs text-destructive">{t('admin.systemStatus.loadError')}</span>
          )}
          {expanded ? (
            <ChevronUp className="size-4 text-muted-foreground" aria-hidden="true" />
          ) : (
            <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
          )}
        </div>
      </button>

      {expanded && (
        <div id="system-status-details" className="border-t border-border px-4 pb-4 pt-3">
          {status?.lowBalance && (
            <div className="mb-4 flex items-start gap-2 rounded-md bg-amber-500/10 p-3">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                {t('admin.systemStatus.lowBalanceWarning')}
              </p>
            </div>
          )}

          {loading && !status ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 rounded-md bg-muted/50 p-3">
                  <Skeleton className="size-8 rounded" />
                  <div className="space-y-1.5">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-3 w-14" />
                  </div>
                </div>
              ))}
            </div>
          ) : status ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <StatusItem
                icon={Wallet}
                label={t('admin.systemStatus.balance')}
                value={`${parseFloat(status.balance).toFixed(6)} ETH`}
                highlight={status.lowBalance}
                badge={
                  status.lowBalance
                    ? t('admin.systemStatus.statusLow')
                    : t('admin.systemStatus.statusOk')
                }
                badgeColor={status.lowBalance ? 'amber' : 'emerald'}
              />
              <StatusItem
                icon={Fuel}
                label={t('admin.systemStatus.gasPrice')}
                value={`${parseFloat(status.gasPrice).toFixed(4)} Gwei`}
              />
              <StatusItem
                icon={CheckCircle2}
                label={t('admin.systemStatus.claimsRemaining')}
                value={`~${status.estimates.claimsRemaining.toLocaleString()}`}
                sublabel={`${t('admin.systemStatus.costPerClaim')}: ${parseFloat(
                  status.estimates.costPerClaim,
                ).toFixed(6)} ETH`}
              />
              <StatusItem
                icon={Hash}
                label={t('admin.systemStatus.registrationsRemaining')}
                value={`~${status.estimates.registrationsRemaining.toLocaleString()}`}
                sublabel={`${t('admin.systemStatus.costPerRegistration')}: ${parseFloat(
                  status.estimates.costPerRegistration,
                ).toFixed(6)} ETH`}
              />
              <StatusItem
                icon={Globe}
                label={t('admin.systemStatus.network')}
                value={status.blockchain.network}
                sublabel={`${t(
                  'admin.systemStatus.blockNumber',
                )}: ${status.blockchain.blockNumber.toLocaleString()}`}
              />
              <div className="flex items-center gap-3 rounded-md bg-muted/50 p-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded bg-muted">
                  <Copy className="size-3.5 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">
                    {t('admin.systemStatus.minterAddress')}
                  </p>
                  <div className="flex items-center gap-1.5">
                    {explorerUrl ? (
                      <a
                        href={explorerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="truncate font-mono text-xs text-primary hover:underline"
                      >
                        {status.minterAddress}
                      </a>
                    ) : (
                      <p className="truncate font-mono text-xs">{status.minterAddress}</p>
                    )}
                    <button
                      onClick={() => copyAddress(status.minterAddress)}
                      className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <Copy className="size-3" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

function StatusItem({
  icon: Icon,
  label,
  value,
  sublabel,
  highlight,
  badge,
  badgeColor,
}: {
  icon: React.ElementType
  label: string
  value: string
  sublabel?: string
  highlight?: boolean
  badge?: string
  badgeColor?: 'amber' | 'emerald'
}) {
  return (
    <div className="flex items-center gap-3 rounded-md bg-muted/50 p-3">
      <div
        className={`flex size-8 shrink-0 items-center justify-center rounded ${
          highlight ? 'bg-amber-500/10' : 'bg-muted'
        }`}
      >
        <Icon className={`size-3.5 ${highlight ? 'text-amber-500' : 'text-muted-foreground'}`} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="flex items-center gap-2">
          <p className={`text-sm font-semibold ${highlight ? 'text-amber-500' : ''}`}>{value}</p>
          {badge && (
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                badgeColor === 'amber'
                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                  : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              }`}
            >
              {badge}
            </span>
          )}
        </div>
        {sublabel && <p className="text-[10px] text-muted-foreground">{sublabel}</p>}
      </div>
    </div>
  )
}
