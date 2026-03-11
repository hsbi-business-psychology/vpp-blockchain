import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { ExternalLink, Loader2, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { useWallet } from '@/hooks/use-wallet'
import { useBlockchain } from '@/hooks/use-blockchain'
import { getTxUrl } from '@/lib/config'

export default function PointsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { wallet, hasWallet, loading: walletLoading } = useWallet()
  const { getTotalPoints, getClaimHistory, loading } = useBlockchain()

  const [totalPoints, setTotalPoints] = useState<number | null>(null)
  const [history, setHistory] = useState<
    Array<{ surveyId: number; points: number; txHash: string; blockNumber: number }>
  >([])

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
        // error is handled by the hook
      }
    }

    fetchData()
  }, [wallet?.address, getTotalPoints, getClaimHistory])

  if (walletLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  if (!hasWallet) {
    return (
      <div className="mx-auto max-w-lg space-y-6 py-8">
        <h1 className="text-2xl font-bold">{t('points.title')}</h1>
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-8">
            <Wallet className="size-10 text-muted-foreground" />
            <p className="text-muted-foreground">{t('points.noWallet')}</p>
            <Button onClick={() => navigate('/wallet')}>
              {t('home.hero.cta.wallet')}
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">{t('points.title')}</h1>

      {/* Total points */}
      <Card>
        <CardHeader>
          <CardDescription>{t('points.total')}</CardDescription>
          <CardTitle className="text-4xl">
            {loading && totalPoints === null ? (
              <Loader2 className="size-8 animate-spin" />
            ) : (
              totalPoints ?? 0
            )}
          </CardTitle>
        </CardHeader>
      </Card>

      {/* Claim history */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('points.history')}</CardTitle>
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
        </CardContent>
      </Card>
    </div>
  )
}
