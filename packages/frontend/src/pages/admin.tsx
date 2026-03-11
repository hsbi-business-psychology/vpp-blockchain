import { useState, useCallback, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { ethers } from 'ethers'
import { ShieldCheck, ShieldX, Loader2, LogOut, AlertTriangle, Download, Info } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { MetricsCards } from '@/components/admin/metrics-cards'
import { SurveyTable } from '@/components/admin/survey-table'
import { RegisterSurveyDialog } from '@/components/admin/register-survey-dialog'
import { RoleManagement } from '@/components/admin/role-management'
import { SubmissionManagement } from '@/components/admin/submission-management'
import { SystemStatus } from '@/components/admin/system-status'
import { useWallet } from '@/hooks/use-wallet'
import { useApi } from '@/hooks/use-api'
import { SURVEY_POINTS_ABI } from '@/lib/contract-abi'
import { storeSecret, getSecret } from '@/lib/survey-secrets'

interface SurveyRow {
  surveyId: number
  title: string
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
  const { getSurveys, registerSurvey, downloadTemplate, deactivateSurvey } = useApi()

  const [adminCheck, setAdminCheck] = useState<'loading' | 'admin' | 'denied'>('loading')
  const [authenticated, setAuthenticated] = useState(false)
  const [authLoading, setAuthLoading] = useState(false)
  const [authCredentials, setAuthCredentials] = useState<{ signature: string; message: string } | null>(null)
  const [surveys, setSurveys] = useState<SurveyRow[]>([])
  const [loading, setLoading] = useState(false)

  const [deactivateTarget, setDeactivateTarget] = useState<SurveyRow | null>(null)
  const [deactivateLoading, setDeactivateLoading] = useState(false)

  const [templateTarget, setTemplateTarget] = useState<SurveyRow | null>(null)
  const [templateSecret, setTemplateSecret] = useState('')
  const [templateLoading, setTemplateLoading] = useState(false)

  const rpcUrl = import.meta.env.VITE_RPC_URL || ''
  const contractAddress = import.meta.env.VITE_CONTRACT_ADDRESS || ''

  const signer = useMemo(() => {
    if (!wallet || !rpcUrl) return null
    try {
      const provider = new ethers.JsonRpcProvider(rpcUrl)
      return new ethers.Wallet(wallet.privateKey, provider)
    } catch {
      return null
    }
  }, [wallet, rpcUrl])

  useEffect(() => {
    if (!wallet || !rpcUrl || !contractAddress) {
      setAdminCheck('loading')
      return
    }

    let cancelled = false
    const check = async () => {
      setAdminCheck('loading')
      try {
        const provider = new ethers.JsonRpcProvider(rpcUrl)
        const contract = new ethers.Contract(contractAddress, SURVEY_POINTS_ABI, provider)
        const result = await contract.isAdmin(wallet.address)
        if (!cancelled) setAdminCheck(result ? 'admin' : 'denied')
      } catch {
        if (!cancelled) setAdminCheck('denied')
      }
    }
    check()
    return () => { cancelled = true }
  }, [wallet, rpcUrl, contractAddress])

  const handleAuth = useCallback(async () => {
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
  }, [wallet, sign, t])

  useEffect(() => {
    if (adminCheck === 'admin' && !authenticated && !authLoading) {
      handleAuth()
    }
  }, [adminCheck, authenticated, authLoading, handleAuth])

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

  const triggerTemplateDownload = async (surveyId: number, secret: string) => {
    try {
      const blob = await downloadTemplate(surveyId, secret)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `vpp-survey-${surveyId}.xml`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      // Non-critical — survey was registered successfully
    }
  }

  const handleRegister = async (data: { surveyId: number; points: number; secret: string; maxClaims: number; title: string }) => {
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

      storeSecret(data.surveyId, data.secret)
      toast.success(t('admin.register.success'))
      await fetchSurveys()

      triggerTemplateDownload(data.surveyId, data.secret)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('admin.register.error'))
      throw err
    }
  }

  const handleDownloadTemplate = async (surveyId: number) => {
    const stored = getSecret(surveyId)
    if (stored) {
      await triggerTemplateDownload(surveyId, stored)
      return
    }
    const survey = surveys.find((s) => s.surveyId === surveyId)
    if (survey) {
      setTemplateTarget(survey)
      setTemplateSecret('')
    }
  }

  const handleTemplateDialogDownload = async () => {
    if (!templateTarget || !templateSecret.trim()) return
    setTemplateLoading(true)
    try {
      storeSecret(templateTarget.surveyId, templateSecret.trim())
      await triggerTemplateDownload(templateTarget.surveyId, templateSecret.trim())
      setTemplateTarget(null)
    } catch {
      toast.error(t('common.error'))
    } finally {
      setTemplateLoading(false)
    }
  }

  const handleDeactivate = (surveyId: number) => {
    const survey = surveys.find((s) => s.surveyId === surveyId)
    if (survey) setDeactivateTarget(survey)
  }

  const handleDeactivateConfirm = async () => {
    if (!deactivateTarget || !wallet) return
    setDeactivateLoading(true)
    try {
      const timestamp = Date.now()
      const message = `Deactivate survey ${deactivateTarget.surveyId} by ${wallet.address} at ${timestamp}`
      const signature = await sign(message)
      await deactivateSurvey(deactivateTarget.surveyId, signature, message)
      toast.success(t('admin.surveys.deactivateConfirm.success'))
      setDeactivateTarget(null)
      await fetchSurveys()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setDeactivateLoading(false)
    }
  }

  const handleLogout = () => {
    setAuthenticated(false)
    setAuthCredentials(null)
    setSurveys([])
  }

  if (!hasWallet) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">{t('admin.title')}</h1>
        <Card className="mx-auto max-w-lg">
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

  if (adminCheck === 'loading') {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">{t('admin.title')}</h1>
        <Card className="mx-auto max-w-lg">
          <CardContent className="flex flex-col items-center gap-4 py-8">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t('admin.roles.checking')}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (adminCheck === 'denied') {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">{t('admin.title')}</h1>
        <Card className="mx-auto max-w-lg">
          <CardContent className="flex flex-col items-center gap-5 py-8 text-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-destructive/10">
              <ShieldX className="size-7 text-destructive" />
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-semibold">{t('admin.accessDenied.title')}</h2>
              <p className="text-base text-muted-foreground">
                {t('admin.accessDenied.description')}
              </p>
            </div>
            <div className="rounded-lg bg-muted p-3 w-full">
              <p className="text-xs text-muted-foreground">Wallet</p>
              <p className="truncate font-mono text-sm">{wallet?.address}</p>
            </div>
            <p className="text-sm text-muted-foreground">
              {t('admin.accessDenied.hint')}
            </p>
            <Button variant="outline" onClick={() => navigate('/')}>
              {t('admin.accessDenied.back')}
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!authenticated) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">{t('admin.title')}</h1>
        <Card className="mx-auto max-w-lg">
          <CardContent className="flex flex-col items-center gap-4 py-8">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t('admin.auth.description')}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Authenticated dashboard
  const totalClaims = surveys.reduce((sum, s) => sum + s.claimCount, 0)
  const totalPointsAwarded = surveys.reduce((sum, s) => sum + s.claimCount * s.points, 0)
  const activeSurveys = surveys.filter((s) => s.active).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('admin.title')}</h1>
        <div className="flex items-center gap-2">
          <RegisterSurveyDialog
            onRegister={handleRegister}
            nextSurveyId={surveys.length > 0 ? Math.max(...surveys.map((s) => s.surveyId)) + 1 : 1}
          />
          <Button variant="ghost" size="icon" onClick={handleLogout} aria-label={t('admin.logout', 'Abmelden')}>
            <LogOut className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      <MetricsCards
        totalSurveys={surveys.length}
        activeSurveys={activeSurveys}
        totalClaims={totalClaims}
        totalPoints={totalPointsAwarded}
        loading={loading}
      />

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('admin.surveys.title')}</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
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

      <Separator />

      <SubmissionManagement />

      <Separator />

      {wallet && signer && (
        <RoleManagement walletAddress={wallet.address} signer={signer} />
      )}

      <Separator />

      {authCredentials && (
        <SystemStatus
          adminSignature={authCredentials.signature}
          adminMessage={authCredentials.message}
        />
      )}

      {/* ─── Deactivate Confirmation Dialog ─── */}
      <Dialog open={!!deactivateTarget} onOpenChange={() => setDeactivateTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <div className="flex size-12 items-center justify-center rounded-lg bg-destructive/10 mb-2">
              <AlertTriangle className="size-6 text-destructive" />
            </div>
            <DialogTitle>{t('admin.surveys.deactivateConfirm.title')}</DialogTitle>
            <DialogDescription>{t('admin.surveys.deactivateConfirm.description')}</DialogDescription>
          </DialogHeader>
          {deactivateTarget && (
            <div className="rounded-lg bg-muted p-3 space-y-1">
              <p className="text-sm font-medium">{deactivateTarget.title || `Survey #${deactivateTarget.surveyId}`}</p>
              <p className="text-xs text-muted-foreground">ID: {deactivateTarget.surveyId} · {deactivateTarget.claimCount} Claims</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeactivateTarget(null)} disabled={deactivateLoading}>
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleDeactivateConfirm} disabled={deactivateLoading}>
              {deactivateLoading ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              ) : (
                <AlertTriangle className="mr-1.5 size-4" />
              )}
              {t('admin.surveys.deactivateConfirm.button')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Template Download Dialog ─── */}
      <Dialog open={!!templateTarget} onOpenChange={() => setTemplateTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <div className="flex size-12 items-center justify-center rounded-lg bg-primary/10 mb-2">
              <Download className="size-6 text-primary" />
            </div>
            <DialogTitle>{t('admin.surveys.templateDialog.title')}</DialogTitle>
            <DialogDescription>{t('admin.surveys.templateDialog.description')}</DialogDescription>
          </DialogHeader>
          {templateTarget && (
            <div className="rounded-lg bg-muted p-3 space-y-1">
              <p className="text-sm font-medium">{templateTarget.title || `Survey #${templateTarget.surveyId}`}</p>
              <p className="text-xs text-muted-foreground">ID: {templateTarget.surveyId} · {templateTarget.points} Punkte</p>
            </div>
          )}
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('admin.surveys.templateDialog.secretLabel')}</label>
            <Input
              value={templateSecret}
              onChange={(e) => setTemplateSecret(e.target.value)}
              placeholder={t('admin.surveys.templateDialog.secretPlaceholder')}
              type="password"
              className="font-mono text-xs"
              onKeyDown={(e) => e.key === 'Enter' && templateSecret.trim() && handleTemplateDownload()}
            />
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Info className="mt-0.5 size-3 shrink-0" />
              {t('admin.surveys.templateDialog.hint')}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateTarget(null)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleTemplateDialogDownload} disabled={!templateSecret.trim() || templateLoading}>
              {templateLoading ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              ) : (
                <Download className="mr-1.5 size-4" />
              )}
              {t('admin.surveys.templateDialog.download')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
