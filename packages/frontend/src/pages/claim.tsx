import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams, useNavigate } from 'react-router'
import { CheckCircle2, ExternalLink, Loader2, AlertCircle, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { useWallet } from '@/hooks/use-wallet'
import { useApi } from '@/hooks/use-api'
import { getTxUrl } from '@/lib/config'
import { cn } from '@/lib/utils'

type ClaimStep = 'wallet' | 'sign' | 'submit' | 'done'

const steps: ClaimStep[] = ['wallet', 'sign', 'submit', 'done']

export default function ClaimPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { wallet, hasWallet, sign } = useWallet()
  const { claimPoints } = useApi()

  const surveyId = searchParams.get('surveyId')
  const secret = searchParams.get('secret')

  const [currentStep, setCurrentStep] = useState<ClaimStep>('wallet')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ txHash: string; points: number } | null>(null)

  useEffect(() => {
    if (hasWallet && currentStep === 'wallet') {
      setCurrentStep('sign')
    }
  }, [hasWallet, currentStep])

  if (!surveyId || !secret) {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-8">
        <h1 className="text-2xl font-bold">{t('claim.title')}</h1>
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>{t('claim.error.missingParams')}</AlertDescription>
        </Alert>
      </div>
    )
  }

  const handleSign = async () => {
    setLoading(true)
    setError(null)
    try {
      const timestamp = Math.floor(Date.now() / 1000)
      const message = `Claim:${surveyId}:${wallet!.address}:${timestamp}`
      const signature = await sign(message)

      setCurrentStep('submit')

      const res = await claimPoints({
        walletAddress: wallet!.address,
        surveyId: Number(surveyId),
        secret,
        signature,
        message,
      })

      setResult({ txHash: res.txHash, points: res.points })
      setCurrentStep('done')
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('claim.error.generic')
      if (msg.includes('already claimed') || msg.includes('AlreadyClaimed')) {
        setError(t('claim.error.alreadyClaimed'))
      } else if (msg.includes('InvalidSecret') || msg.includes('invalid secret')) {
        setError(t('claim.error.invalidSecret'))
      } else if (msg.includes('not active') || msg.includes('SurveyNotActive')) {
        setError(t('claim.error.surveyInactive'))
      } else {
        setError(msg)
      }
      setCurrentStep('sign')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 py-8">
      <h1 className="text-2xl font-bold">{t('claim.title')}</h1>

      {/* Stepper */}
      <div className="flex items-center justify-between">
        {steps.map((step, i) => {
          const stepIndex = steps.indexOf(currentStep)
          const isDone = i < stepIndex || currentStep === 'done'
          const isCurrent = step === currentStep

          return (
            <div key={step} className="flex flex-1 items-center">
              <div className="flex flex-col items-center gap-1">
                <div
                  className={cn(
                    'flex size-8 items-center justify-center rounded-full text-xs font-medium transition-colors',
                    isDone && 'bg-success text-success-foreground',
                    isCurrent && !isDone && 'bg-primary text-primary-foreground',
                    !isDone && !isCurrent && 'bg-muted text-muted-foreground',
                  )}
                >
                  {isDone ? <CheckCircle2 className="size-4" /> : i + 1}
                </div>
                <span className="text-xs text-muted-foreground">{t(`claim.steps.${step}`)}</span>
              </div>
              {i < steps.length - 1 && (
                <div
                  className={cn(
                    'mx-2 h-px flex-1',
                    isDone ? 'bg-success' : 'bg-border',
                  )}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Step content */}
      {currentStep === 'wallet' && !hasWallet && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="size-5" />
              {t('claim.steps.wallet')}
            </CardTitle>
            <CardDescription>{t('claim.noWallet')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate('/points')} className="w-full">
              {t('claim.createFirst')}
            </Button>
          </CardContent>
        </Card>
      )}

      {currentStep === 'sign' && (
        <Card>
          <CardHeader>
            <CardTitle>{t('claim.steps.sign')}</CardTitle>
            <CardDescription>
              Survey <Badge variant="secondary">{surveyId}</Badge>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="size-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="rounded-lg bg-muted p-3">
              <p className="text-xs text-muted-foreground">Wallet</p>
              <p className="truncate text-sm font-mono">{wallet?.address}</p>
            </div>
            <Button onClick={handleSign} disabled={loading} className="w-full">
              {loading ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  {t('claim.signing')}
                </>
              ) : (
                t('common.submit')
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {currentStep === 'submit' && (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-8" role="status" aria-live="polite">
            <Loader2 className="size-8 animate-spin text-primary" aria-hidden="true" />
            <p className="text-muted-foreground">{t('claim.submitting')}</p>
          </CardContent>
        </Card>
      )}

      {currentStep === 'done' && result && (
        <Card className="border-success/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-success">
              <CheckCircle2 className="size-5" />
              {t('claim.success.title')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-success/10 p-4 text-center">
              <p className="text-3xl font-bold">{result.points}</p>
              <p className="text-sm text-muted-foreground">
                {t('claim.success.points', { points: result.points })}
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">{t('claim.success.tx')}</p>
              <a
                href={getTxUrl(result.txHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-primary hover:underline"
              >
                <code className="truncate">{result.txHash}</code>
                <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
              </a>
            </div>
            <Button variant="outline" onClick={() => navigate('/points')} className="w-full">
              {t('claim.success.viewPoints')}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
