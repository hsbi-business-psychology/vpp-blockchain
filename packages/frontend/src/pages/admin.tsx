import { useState, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, LogOut } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { MetricsCards } from '@/components/admin/metrics-cards'
import { SurveyTable } from '@/components/admin/survey-table'
import { RegisterSurveyDialog } from '@/components/admin/register-survey-dialog'
import { RoleManagement } from '@/components/admin/role-management'
import { SubmissionManagement } from '@/components/admin/submission-management'
import { SystemStatus } from '@/components/admin/system-status'
import { AdminAuthGate } from '@/components/admin/admin-auth-gate'
import { DeactivateSurveyDialog } from '@/components/admin/deactivate-survey-dialog'
import { TemplateDownloadDialog } from '@/components/admin/template-download-dialog'
import { RegenerateTemplateDialog } from '@/components/admin/regenerate-template-dialog'
import { useWallet } from '@/hooks/use-wallet'
import { useApi } from '@/hooks/use-api'
import { useBlockchain } from '@/hooks/use-blockchain'
import { ApiRequestError } from '@vpp/shared'
import type { SurveyInfo } from '@vpp/shared'

export default function AdminPage() {
  const { t } = useTranslation()
  const { wallet, hasWallet, sign } = useWallet()
  const {
    getSurveys,
    registerSurvey,
    downloadTemplate,
    deactivateSurvey,
    reactivateSurvey,
    rotateSurveyKey,
  } = useApi()
  const { isAdmin: checkIsAdmin } = useBlockchain()

  const [adminCheck, setAdminCheck] = useState<'loading' | 'admin' | 'denied'>('loading')
  const [authenticated, setAuthenticated] = useState(false)
  const [authLoading, setAuthLoading] = useState(false)
  const [loggedOut, setLoggedOut] = useState(false)
  // True after the admin rejected/cancelled the MetaMask sign popup. Acts
  // as a one-shot guard for the auto-auth effect — without it, every
  // re-render after a rejection re-opens the popup, locking the admin out
  // of the tab. Reset to false when the admin clicks "Sign again". See
  // audit F5.2 / M9.
  const [authFailed, setAuthFailed] = useState(false)
  const [authCredentials, setAuthCredentials] = useState<{
    signature: string
    message: string
  } | null>(null)
  const [surveys, setSurveys] = useState<SurveyInfo[]>([])
  const [loading, setLoading] = useState(false)

  const [deactivateTarget, setDeactivateTarget] = useState<SurveyInfo | null>(null)
  const [deactivateLoading, setDeactivateLoading] = useState(false)

  const [templateTarget, setTemplateTarget] = useState<SurveyInfo | null>(null)
  const [templateLoading, setTemplateLoading] = useState(false)
  const [templateFreshMode, setTemplateFreshMode] = useState<'none' | 'registered' | 'regenerated'>(
    'none',
  )

  const [regenerateTarget, setRegenerateTarget] = useState<SurveyInfo | null>(null)
  const [regenerateLoading, setRegenerateLoading] = useState(false)

  // ── Admin check ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!wallet) {
      setAdminCheck('loading')
      return
    }

    let cancelled = false
    const check = async () => {
      setAdminCheck('loading')
      try {
        const result = await checkIsAdmin(wallet.address)
        if (!cancelled) setAdminCheck(result ? 'admin' : 'denied')
      } catch {
        if (!cancelled) setAdminCheck('denied')
      }
    }
    check()
    return () => {
      cancelled = true
    }
  }, [wallet, checkIsAdmin])

  // ── Auth ───────────────────────────────────────────────────────────────
  // Treat any error from the wallet `sign()` call that mentions "user",
  // "deny", "reject" or matches the EIP-1193 4001 code as a deliberate
  // user cancellation. We must NOT auto-retry in that case (see audit
  // F5.2). Anything else (network, malformed message, signer not ready)
  // is surfaced as an actionable retry — the gate UI lets the admin
  // re-trigger the popup explicitly.
  function isUserRejectedSignError(err: unknown): boolean {
    if (!err) return false
    if (typeof err === 'object') {
      const e = err as { code?: number | string; message?: string }
      if (e.code === 4001 || e.code === 'ACTION_REJECTED') return true
      const msg = (e.message ?? '').toLowerCase()
      if (msg.includes('user denied')) return true
      if (msg.includes('user rejected')) return true
      if (msg.includes('rejected by user')) return true
      if (msg.includes('cancelled') || msg.includes('canceled')) return true
    }
    return false
  }

  const handleAuth = useCallback(async () => {
    if (!wallet) return
    setAuthLoading(true)
    setAuthFailed(false)
    try {
      const timestamp = Math.floor(Date.now() / 1000)
      const message = `Admin login ${wallet.address} at ${timestamp}`
      const signature = await sign(message)
      setAuthCredentials({ signature, message })
      setAuthenticated(true)
    } catch (err) {
      // Either user rejection or any other failure: latch authFailed to
      // stop the auto-auth effect from re-firing on the next re-render.
      // The gate UI hands the user back control via a "Retry" button.
      setAuthFailed(true)
      if (!isUserRejectedSignError(err)) {
        toast.error(err instanceof ApiRequestError ? err.message : t('common.error'))
      }
    } finally {
      setAuthLoading(false)
    }
  }, [wallet, sign, t])

  const handleRetryAuth = useCallback(() => {
    setAuthFailed(false)
    void handleAuth()
  }, [handleAuth])

  useEffect(() => {
    if (adminCheck === 'admin' && !authenticated && !authLoading && !loggedOut && !authFailed) {
      handleAuth()
    }
  }, [adminCheck, authenticated, authLoading, loggedOut, authFailed, handleAuth])

  // ── Surveys ────────────────────────────────────────────────────────────
  const fetchSurveys = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getSurveys()
      setSurveys(data)
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : t('common.error'))
    } finally {
      setLoading(false)
    }
  }, [getSurveys, t])

  useEffect(() => {
    if (authenticated) fetchSurveys()
  }, [authenticated, fetchSurveys])

  // ── Handlers ───────────────────────────────────────────────────────────
  const handleRegister = async (data: {
    surveyId: number
    points: number
    maxClaims: number
    title: string
  }) => {
    if (!authCredentials) return
    try {
      const timestamp = Math.floor(Date.now() / 1000)
      const message = `Register survey ${data.surveyId} by ${wallet!.address} at ${timestamp}`
      const signature = await sign(message)

      const result = await registerSurvey({
        ...data,
        adminSignature: signature,
        adminMessage: message,
      })

      toast.success(t('admin.register.success'))
      await fetchSurveys()

      // V2 UX: after registration go straight to the template-download
      // dialog. The HMAC key is baked into the downloaded file — admins
      // never have to see or handle the raw key.
      const fresh = (await getSurveys()).find((s) => s.surveyId === data.surveyId)
      if (fresh) {
        setTemplateTarget(fresh)
        setTemplateFreshMode('registered')
      }
      // The result.key is intentionally discarded — it was generated
      // server-side and is reachable later via the rotate (regenerate)
      // flow if ever needed.
      void result
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : t('admin.register.error'))
      throw err
    }
  }

  const handleDeactivateConfirm = async () => {
    if (!deactivateTarget || !wallet) return
    setDeactivateLoading(true)
    try {
      const timestamp = Math.floor(Date.now() / 1000)
      const message = `Deactivate survey ${deactivateTarget.surveyId} by ${wallet.address} at ${timestamp}`
      const signature = await sign(message)
      await deactivateSurvey(deactivateTarget.surveyId, signature, message)
      toast.success(t('admin.surveys.deactivateConfirm.success'))
      setDeactivateTarget(null)
      await fetchSurveys()
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : t('common.error'))
    } finally {
      setDeactivateLoading(false)
    }
  }

  const handleReactivate = async (surveyId: number) => {
    if (!wallet) return
    try {
      const timestamp = Math.floor(Date.now() / 1000)
      const message = `Reactivate survey ${surveyId} by ${wallet.address} at ${timestamp}`
      const signature = await sign(message)
      await reactivateSurvey(surveyId, signature, message)
      toast.success(t('admin.surveys.reactivate.success'))
      await fetchSurveys()
    } catch (err) {
      toast.error(
        err instanceof ApiRequestError ? err.message : t('admin.surveys.reactivate.error'),
      )
    }
  }

  const handleTemplateFormatDownload = async (format: 'sosci' | 'limesurvey') => {
    if (!templateTarget) return
    setTemplateLoading(true)
    try {
      const timestamp = Math.floor(Date.now() / 1000)
      const message = `Download template ${templateTarget.surveyId} by ${
        wallet!.address
      } at ${timestamp}`
      const signature = await sign(message)
      const blob = await downloadTemplate(templateTarget.surveyId, format, signature, message)
      const ext = format === 'limesurvey' ? 'lss' : 'xml'
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `vpp-survey-${templateTarget.surveyId}.${ext}`
      a.click()
      URL.revokeObjectURL(url)
      toast.success(
        format === 'sosci'
          ? t('admin.surveys.templateDialog.sosci.title')
          : t('admin.surveys.templateDialog.limesurvey.title'),
      )
    } catch {
      toast.error(t('common.error'))
    } finally {
      setTemplateLoading(false)
    }
  }

  const handleDownloadTemplate = (surveyId: number) => {
    const survey = surveys.find((s) => s.surveyId === surveyId)
    if (!survey) return
    setTemplateTarget(survey)
    setTemplateFreshMode('none')
  }

  const handleCloseTemplate = () => {
    setTemplateTarget(null)
    setTemplateFreshMode('none')
  }

  const handleDeactivate = (surveyId: number) => {
    const survey = surveys.find((s) => s.surveyId === surveyId)
    if (survey) setDeactivateTarget(survey)
  }

  const handleRegenerate = (surveyId: number) => {
    const survey = surveys.find((s) => s.surveyId === surveyId)
    if (survey) setRegenerateTarget(survey)
  }

  // Confirmed regenerate: signs the request, rotates the underlying
  // HMAC key on the server, then immediately opens the
  // template-download dialog so the admin can grab the new file in one
  // flow. The raw key never enters the UI.
  const handleRegenerateConfirm = useCallback(async () => {
    if (!wallet || !regenerateTarget) return
    setRegenerateLoading(true)
    try {
      const timestamp = Math.floor(Date.now() / 1000)
      const message = `Rotate survey key ${regenerateTarget.surveyId} by ${wallet.address} at ${timestamp}`
      const signature = await sign(message)
      await rotateSurveyKey(regenerateTarget.surveyId, signature, message)
      toast.success(t('admin.surveys.regenerateConfirm.success'))
      const target = regenerateTarget
      setRegenerateTarget(null)
      setTemplateTarget(target)
      setTemplateFreshMode('regenerated')
    } catch (err) {
      toast.error(
        err instanceof ApiRequestError ? err.message : t('admin.surveys.regenerateConfirm.error'),
      )
    } finally {
      setRegenerateLoading(false)
    }
  }, [wallet, regenerateTarget, sign, rotateSurveyKey, t])

  const handleLogout = () => {
    setAuthenticated(false)
    setAuthCredentials(null)
    setSurveys([])
    setLoggedOut(true)
  }

  // ── Auth gate (early returns) ──────────────────────────────────────────
  if (!hasWallet || adminCheck !== 'admin' || !authenticated) {
    return (
      <AdminAuthGate
        hasWallet={hasWallet}
        adminCheck={adminCheck}
        authenticated={authenticated}
        walletAddress={wallet?.address}
        authFailed={authFailed}
        onRetry={handleRetryAuth}
      />
    )
  }

  // ── Authenticated dashboard ────────────────────────────────────────────
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
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            aria-label={t('admin.logout', 'Abmelden')}
          >
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
              onReactivate={handleReactivate}
              onRegenerateTemplate={handleRegenerate}
            />
          )}
        </CardContent>
      </Card>

      <Separator />
      <SubmissionManagement />
      <Separator />
      {wallet && <RoleManagement walletAddress={wallet.address} sign={sign} />}
      <Separator />
      {authCredentials && (
        <SystemStatus
          adminSignature={authCredentials.signature}
          adminMessage={authCredentials.message}
        />
      )}

      <DeactivateSurveyDialog
        survey={deactivateTarget}
        loading={deactivateLoading}
        onConfirm={handleDeactivateConfirm}
        onClose={() => setDeactivateTarget(null)}
      />

      <TemplateDownloadDialog
        survey={templateTarget}
        loading={templateLoading}
        freshHintMode={templateFreshMode}
        onDownload={handleTemplateFormatDownload}
        onClose={handleCloseTemplate}
      />

      <RegenerateTemplateDialog
        survey={regenerateTarget}
        loading={regenerateLoading}
        onConfirm={handleRegenerateConfirm}
        onClose={() => setRegenerateTarget(null)}
      />
    </div>
  )
}
