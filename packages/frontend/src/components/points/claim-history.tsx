import { useTranslation } from 'react-i18next'
import { ExternalLink } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { getTxUrl } from '@/lib/config'
import { formatPoints } from '@/lib/utils'

export interface ClaimEntry {
  surveyId: number
  points: number
  txHash: string
  blockNumber: number
  title?: string
  claimedAt?: string
}

function formatDate(iso: string | undefined, locale: string): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

interface ClaimHistoryProps {
  history: ClaimEntry[]
  dataLoading: boolean
}

export function ClaimHistory({ history, dataLoading }: ClaimHistoryProps) {
  const { t, i18n } = useTranslation()

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('points.history')}</CardTitle>
        {history.length > 0 && <CardDescription>{t('points.historyDescription')}</CardDescription>}
      </CardHeader>
      <CardContent>
        {dataLoading && history.length === 0 ? (
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
                    <TableHead>{t('points.table.date')}</TableHead>
                    <TableHead className="text-right">{t('points.table.points')}</TableHead>
                    <TableHead>{t('points.table.tx')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((entry) => (
                    <TableRow key={entry.txHash}>
                      <TableCell>
                        <span className="font-medium">#{entry.surveyId}</span>
                        {entry.title && (
                          <span className="ml-2 text-muted-foreground">{entry.title}</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatDate(entry.claimedAt, i18n.language)}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatPoints(entry.points, i18n.language)}
                      </TableCell>
                      <TableCell>
                        <a
                          href={getTxUrl(entry.txHash)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                        >
                          {entry.txHash.slice(0, 10)}...
                          <ExternalLink className="size-3" aria-hidden="true" />
                          <span className="sr-only">
                            {t('points.table.viewTx', 'Transaktion anzeigen')}
                          </span>
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
                <div
                  key={entry.txHash}
                  className="flex items-center justify-between rounded-lg border border-border p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      #{entry.surveyId}
                      {entry.title && (
                        <span className="font-normal text-muted-foreground"> {entry.title}</span>
                      )}
                    </p>
                    {entry.claimedAt && (
                      <p className="text-xs text-muted-foreground">
                        {formatDate(entry.claimedAt, i18n.language)}
                      </p>
                    )}
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
                    +{formatPoints(entry.points, i18n.language)}
                  </Badge>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
