import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, Loader2, ExternalLink, Award } from 'lucide-react'
import { ethers } from 'ethers'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useApi } from '@/hooks/use-api'
import { getTxUrl } from '@/lib/config'

export function PointsExplorer() {
  const { t } = useTranslation()
  const { getPointsData } = useApi()

  const [searchAddress, setSearchAddress] = useState('')
  const [searchPoints, setSearchPoints] = useState<number | null>(null)
  const [searchHistory, setSearchHistory] = useState<
    Array<{ surveyId: number; points: number; txHash: string }>
  >([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState('')

  async function handleSearch() {
    const addr = searchAddress.trim()
    if (!ethers.isAddress(addr)) {
      setSearchError(t('points.explorer.invalidAddress'))
      return
    }
    setSearchError('')
    setSearchLoading(true)
    try {
      const data = await getPointsData(addr)
      setSearchPoints(data.totalPoints)
      setSearchHistory(
        data.surveys.map((s) => ({
          surveyId: s.surveyId,
          points: s.points,
          txHash: s.txHash,
        })),
      )
    } catch {
      setSearchError(t('common.error'))
    } finally {
      setSearchLoading(false)
    }
  }

  return (
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
        {searchError && (
          <p className="text-sm text-destructive" role="alert">
            {searchError}
          </p>
        )}
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
  )
}
