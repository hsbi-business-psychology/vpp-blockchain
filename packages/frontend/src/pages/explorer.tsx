import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, ExternalLink, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useBlockchain } from '@/hooks/use-blockchain'
import { isValidAddress } from '@/lib/wallet'
import { getAddressUrl, getTxUrl } from '@/lib/config'

export default function ExplorerPage() {
  const { t } = useTranslation()
  const { getTotalPoints, getClaimHistory } = useBlockchain()

  const [address, setAddress] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{
    address: string
    totalPoints: number
    history: Array<{ surveyId: number; points: number; txHash: string; blockNumber: number }>
  } | null>(null)

  const handleSearch = useCallback(async () => {
    setError(null)
    const trimmed = address.trim()

    if (!isValidAddress(trimmed)) {
      setError(t('explorer.invalidAddress'))
      return
    }

    setLoading(true)
    try {
      const [points, history] = await Promise.all([
        getTotalPoints(trimmed),
        getClaimHistory(trimmed),
      ])
      setResult({ address: trimmed, totalPoints: points, history })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setLoading(false)
    }
  }, [address, getTotalPoints, getClaimHistory, t])

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('explorer.title')}</h1>
        <p className="mt-1 text-muted-foreground">{t('explorer.description')}</p>
      </div>

      {/* Search */}
      <div className="flex gap-2">
        <Input
          placeholder={t('explorer.placeholder')}
          value={address}
          onChange={(e) => {
            setAddress(e.target.value)
            setError(null)
          }}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          className="font-mono text-sm"
        />
        <Button onClick={handleSearch} disabled={loading || !address.trim()}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardDescription>
                {t('explorer.results', { address: '' })}
              </CardDescription>
              <div className="flex items-center gap-2">
                <a
                  href={getAddressUrl(result.address)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 truncate text-sm text-primary hover:underline"
                >
                  <code>{result.address}</code>
                  <ExternalLink className="size-3 shrink-0" />
                </a>
              </div>
              <CardTitle className="text-4xl">{result.totalPoints}</CardTitle>
              <CardDescription>{t('points.total')}</CardDescription>
            </CardHeader>
          </Card>

          {result.history.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t('points.history')}</CardTitle>
              </CardHeader>
              <CardContent>
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
                      {result.history.map((entry) => (
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
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
