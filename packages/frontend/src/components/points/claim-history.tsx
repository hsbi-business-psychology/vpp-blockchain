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

export interface ClaimEntry {
  surveyId: number
  points: number
  txHash: string
  blockNumber: number
}

interface ClaimHistoryProps {
  history: ClaimEntry[]
  dataLoading: boolean
}

export function ClaimHistory({ history, dataLoading }: ClaimHistoryProps) {
  const { t } = useTranslation()

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
  )
}
