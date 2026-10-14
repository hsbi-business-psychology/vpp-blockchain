import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ethers } from 'ethers'
import { toast } from 'sonner'
import { ExternalLink, Loader2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CollapsibleCard } from '@/components/ui/collapsible-card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useApi } from '@/hooks/use-api'
import { getTxUrl } from '@/lib/config'
import { formatPoints } from '@/lib/utils'
import { ApiRequestError, type SurveyInfo } from '@vpp/shared'

interface AwardPointsProps {
  surveys: SurveyInfo[]
  walletAddress: string
  sign: (message: string) => Promise<string>
  /** Called after a successful award, e.g. to refresh the claim counts. */
  onAwarded: () => void
}

interface WalletPreview {
  totalPoints: number
  claimedSurveyIds: Set<number>
}

function isUserRejected(err: unknown): boolean {
  const e = err as { code?: number | string; message?: string } | null
  if (e?.code === 4001 || e?.code === 'ACTION_REJECTED') return true
  return /user (denied|rejected)|rejected by user|cancel/i.test(e?.message ?? '')
}

/**
 * Lets an admin give a wallet the points of a survey by hand, for
 * participants whose claim did not go through. Every award is confirmed
 * with its own wallet signature naming survey and wallet.
 */
export function AwardPoints({ surveys, walletAddress, sign, onAwarded }: AwardPointsProps) {
  const { t, i18n } = useTranslation()
  const { awardPointsManually, getPointsData } = useApi()

  const [surveyId, setSurveyId] = useState('')
  const [address, setAddress] = useState('')
  const [preview, setPreview] = useState<WalletPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [lastAward, setLastAward] = useState<{
    surveyId: number
    student: string
    points: number
    txHash: string
  } | null>(null)

  const options = useMemo(
    () =>
      [...surveys].sort((a, b) => Number(b.active) - Number(a.active) || b.surveyId - a.surveyId),
    [surveys],
  )
  const survey = surveys.find((s) => String(s.surveyId) === surveyId)
  const student = address.trim()
  const addressValid = ethers.isAddress(student)

  // Look the wallet up as soon as the address is complete, so the admin
  // sees whose balance they are adding to before signing anything.
  useEffect(() => {
    if (!addressValid) {
      setPreview(null)
      return
    }
    let cancelled = false
    setPreviewLoading(true)
    getPointsData(student)
      .then((data) => {
        if (cancelled) return
        setPreview({
          totalPoints: data.totalPoints,
          claimedSurveyIds: new Set(data.surveys.map((s) => s.surveyId)),
        })
      })
      .catch(() => {
        if (!cancelled) setPreview(null)
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [student, addressValid, getPointsData])

  const alreadyAwarded = !!survey && !!preview?.claimedSurveyIds.has(survey.surveyId)
  const canAward = !!survey && survey.active && addressValid && !alreadyAwarded && !previewLoading

  const surveyLabel = (s: SurveyInfo) =>
    `#${s.surveyId} · ${s.title || t('admin.award.untitled')} · ${t('admin.award.pointsValue', {
      points: formatPoints(s.points, i18n.language),
    })}`

  const errorText = (err: unknown): string => {
    if (!(err instanceof ApiRequestError)) return t('common.error')
    const byCode: Record<string, string> = {
      ALREADY_CLAIMED: t('admin.award.errorAlreadyAwarded'),
      SURVEY_INACTIVE: t('admin.award.errorInactive'),
      MAX_CLAIMS_REACHED: t('admin.award.errorMaxClaims'),
      FORBIDDEN: t('admin.award.errorForbidden'),
    }
    return byCode[err.code] ?? err.message
  }

  const handleConfirm = async () => {
    if (!survey || !canAward) return
    setSubmitting(true)
    try {
      const timestamp = Math.floor(Date.now() / 1000)
      const message = `Award survey ${survey.surveyId} to ${student} by ${walletAddress} at ${timestamp}`
      const signature = await sign(message)
      const result = await awardPointsManually(survey.surveyId, student, signature, message)
      setLastAward({
        surveyId: survey.surveyId,
        student: result.student,
        points: result.points,
        txHash: result.txHash,
      })
      toast.success(
        t('admin.award.success', { points: formatPoints(result.points, i18n.language) }),
      )
      setConfirmOpen(false)
      setAddress('')
      onAwarded()
    } catch (err) {
      if (!isUserRejected(err)) toast.error(errorText(err))
    } finally {
      setSubmitting(false)
    }
  }

  let addressHint: { text: string; tone: 'muted' | 'error' } | null = null
  if (student && !addressValid) {
    addressHint = { text: t('admin.award.invalidAddress'), tone: 'error' }
  } else if (previewLoading) {
    addressHint = { text: t('admin.award.checkingWallet'), tone: 'muted' }
  } else if (alreadyAwarded) {
    addressHint = { text: t('admin.award.errorAlreadyAwarded'), tone: 'error' }
  } else if (preview) {
    addressHint = {
      text: t('admin.award.walletBalance', {
        points: formatPoints(preview.totalPoints, i18n.language),
      }),
      tone: 'muted',
    }
  }

  return (
    <CollapsibleCard
      title={t('admin.award.title')}
      description={t('admin.award.description')}
      info={{ label: t('admin.award.infoLabel'), text: t('admin.award.infoTip') }}
      contentClassName="space-y-5"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="award-survey">{t('admin.award.survey')}</Label>
          <Select value={surveyId} onValueChange={setSurveyId}>
            <SelectTrigger id="award-survey" className="w-full">
              <SelectValue placeholder={t('admin.award.surveyPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {options.map((s) => (
                <SelectItem key={s.surveyId} value={String(s.surveyId)}>
                  {surveyLabel(s)}
                  {!s.active && ` (${t('admin.award.inactive')})`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {survey && !survey.active && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              {t('admin.award.inactiveHint')}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="award-wallet">{t('admin.award.wallet')}</Label>
          <Input
            id="award-wallet"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="0x…"
            className="font-mono"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={addressHint?.tone === 'error'}
            aria-describedby="award-wallet-hint"
          />
          <p
            id="award-wallet-hint"
            className={
              addressHint?.tone === 'error'
                ? 'text-xs text-destructive'
                : 'text-xs text-muted-foreground'
            }
          >
            {addressHint?.text ?? t('admin.award.walletHint')}
          </p>
        </div>
      </div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          {lastAward && (
            <>
              {t('admin.award.last', {
                points: formatPoints(lastAward.points, i18n.language),
                surveyId: lastAward.surveyId,
                wallet: `${lastAward.student.slice(0, 6)}…${lastAward.student.slice(-4)}`,
              })}{' '}
              <a
                href={getTxUrl(lastAward.txHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                {t('admin.award.viewTx')}
                <ExternalLink className="size-3" aria-hidden="true" />
              </a>
            </>
          )}
        </p>
        <Button onClick={() => setConfirmOpen(true)} disabled={!canAward}>
          <Plus className="mr-2 size-4" aria-hidden="true" />
          {t('admin.award.button')}
        </Button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={(open) => !submitting && setConfirmOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.award.confirmTitle')}</DialogTitle>
            <DialogDescription>{t('admin.award.confirmDescription')}</DialogDescription>
          </DialogHeader>
          {survey && (
            <dl className="space-y-3 rounded-lg bg-muted/50 p-4 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">{t('admin.award.survey')}</dt>
                <dd className="font-medium">
                  #{survey.surveyId} {survey.title || t('admin.award.untitled')}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t('admin.award.points')}</dt>
                <dd className="font-medium">{formatPoints(survey.points, i18n.language)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t('admin.award.wallet')}</dt>
                <dd className="break-all font-mono text-xs">{student}</dd>
              </div>
            </dl>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={submitting}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleConfirm} disabled={submitting || !canAward}>
              {submitting && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />}
              {t('admin.award.confirmButton')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CollapsibleCard>
  )
}
