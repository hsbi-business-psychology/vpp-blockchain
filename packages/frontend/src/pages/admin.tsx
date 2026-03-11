import { useState, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { ShieldCheck, Loader2, LogOut } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { MetricsCards } from '@/components/admin/metrics-cards'
import { SurveyTable } from '@/components/admin/survey-table'
import { RegisterSurveyDialog } from '@/components/admin/register-survey-dialog'
import { useWallet } from '@/hooks/use-wallet'
import { useApi } from '@/hooks/use-api'

interface SurveyRow {
  surveyId: number
  points: number
  maxClaims: number
  claimCount: number
  active: boolean
  registeredAt: string
}

export default function AdminPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { wallet, hasWallet, sign } = useWallet()
  const { getSurveys, registerSurvey, downloadTemplate } = useApi()

  const [authenticated, setAuthenticated] = useState(false)
  const [authLoading, setAuthLoading] = useState(false)
  const [authCredentials, setAuthCredentials] = useState<{ signature: string; message: string } | null>(null)
  const [surveys, setSurveys] = useState<SurveyRow[]>([])
  const [loading, setLoading] = useState(false)

  const handleAuth = async () => {
    if (!wallet) return
    setAuthLoading(true)
    try {
      const timestamp = Date.now()
      const message = `Admin login ${wallet.address} at ${timestamp}`
      const signature = await sign(message)
      setAuthCredentials({ signature, message })
      setAuthenticated(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setAuthLoading(false)
    }
  }

  const fetchSurveys = useCallback(async () => {
    if (!authCredentials) return
    setLoading(true)
    try {
      const data = await getSurveys(authCredentials.signature, authCredentials.message)
      setSurveys(data)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setLoading(false)
    }
  }, [authCredentials, getSurveys, t])

  useEffect(() => {
    if (authenticated) {
      fetchSurveys()
    }
  }, [authenticated, fetchSurveys])

  const handleRegister = async (data: { surveyId: number; points: number; secret: string; maxClaims: number }) => {
    if (!authCredentials) return
    try {
      const timestamp = Date.now()
      const message = `Register survey ${data.surveyId} by ${wallet!.address} at ${timestamp}`
      const signature = await sign(message)

      await registerSurvey({
        ...data,
        adminSignature: signature,
        adminMessage: message,
      })
      toast.success(t('admin.register.success'))
      await fetchSurveys()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('admin.register.error'))
      throw err
    }
  }

  const handleDownloadTemplate = async (surveyId: number) => {
    try {
      const blob = await downloadTemplate(surveyId)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `survey-${surveyId}-template.xml`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error(t('common.error'))
    }
  }

  const handleDeactivate = async (_surveyId: number) => {
    toast.info('Survey deactivation via admin UI coming soon')
  }

  const handleLogout = () => {
    setAuthenticated(false)
    setAuthCredentials(null)
    setSurveys([])
  }

  // No wallet -> redirect to wallet page
  if (!hasWallet) {
    return (
      <div className="mx-auto max-w-lg space-y-6 py-8">
        <h1 className="text-2xl font-bold">{t('admin.title')}</h1>
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-8">
            <ShieldCheck className="size-10 text-muted-foreground" />
            <p className="text-muted-foreground">{t('points.noWallet')}</p>
            <Button onClick={() => navigate('/points')}>
              {t('wallet.create.title')}
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Not authenticated -> sign in
  if (!authenticated) {
    return (
      <div className="mx-auto max-w-lg space-y-6 py-8">
        <h1 className="text-2xl font-bold">{t('admin.title')}</h1>
        <Card>
          <CardHeader>
            <div className="flex size-12 items-center justify-center rounded-lg bg-primary/10">
              <ShieldCheck className="size-6 text-primary" />
            </div>
            <CardTitle>{t('admin.auth.title')}</CardTitle>
            <CardDescription>{t('admin.auth.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-muted p-3">
              <p className="text-xs text-muted-foreground">Wallet</p>
              <p className="truncate text-sm font-mono">{wallet?.address}</p>
            </div>
            <Button onClick={handleAuth} disabled={authLoading} className="w-full">
              {authLoading ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  {t('common.loading')}
                </>
              ) : (
                <>
                  <ShieldCheck className="mr-2 size-4" />
                  {t('admin.auth.button')}
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Authenticated -> dashboard
  const totalClaims = surveys.reduce((sum, s) => sum + s.claimCount, 0)
  const totalPointsAwarded = surveys.reduce((sum, s) => sum + s.claimCount * s.points, 0)
  const activeSurveys = surveys.filter((s) => s.active).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('admin.title')}</h1>
        <div className="flex items-center gap-2">
          <RegisterSurveyDialog onRegister={handleRegister} />
          <Button variant="ghost" size="icon" onClick={handleLogout}>
            <LogOut className="size-4" />
          </Button>
        </div>
      </div>

      <MetricsCards
        totalSurveys={surveys.length}
        activeSurveys={activeSurveys}
        totalClaims={totalClaims}
        totalPoints={totalPointsAwarded}
      />

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('admin.surveys.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <SurveyTable
              surveys={surveys}
              onDownloadTemplate={handleDownloadTemplate}
              onDeactivate={handleDeactivate}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
