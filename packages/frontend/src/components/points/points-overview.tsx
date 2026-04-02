import { useTranslation } from 'react-i18next'
import { Loader2, Info, Award, ClipboardCheck, Gift, BarChart3, CheckCircle2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface PointsOverviewProps {
  totalPoints: number | null
  dataLoading: boolean
  dataError: boolean
  walletSubmitted: boolean
  hasHistory: boolean
}

export function PointsOverview({
  totalPoints,
  dataLoading,
  dataError,
  walletSubmitted,
  hasHistory,
}: PointsOverviewProps) {
  const { t } = useTranslation()

  return (
    <>
      {/* Points total */}
      <div className="flex items-center gap-4 rounded-lg border border-border bg-card p-4 sm:p-5">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 sm:size-14">
          <Award className="size-6 text-primary sm:size-7" />
        </div>
        <div>
          <p className="text-4xl font-bold leading-none sm:text-5xl">
            {dataLoading && totalPoints === null ? (
              <Loader2 className="size-8 animate-spin" />
            ) : (
              totalPoints ?? 0
            )}
          </p>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">{t('points.total')}</p>
        </div>
      </div>

      {/* Data Error Banner */}
      {dataError && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-3">
          <Info className="size-4 shrink-0 text-destructive" aria-hidden="true" />
          <p className="text-sm text-destructive">{t('points.dataError')}</p>
        </div>
      )}

      {/* Submitted Banner */}
      {walletSubmitted && (
        <div className="flex items-start gap-3 rounded-lg border border-green-500/20 bg-green-500/5 p-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-green-500/10">
            <CheckCircle2 className="size-5 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <p className="font-semibold text-green-700 dark:text-green-400">
              {t('points.submittedBanner.title')}
            </p>
            <p className="mt-0.5 text-sm text-green-600/80 dark:text-green-400/80">
              {t('points.submittedBanner.description')}
            </p>
          </div>
        </div>
      )}

      {/* How It Works */}
      {!hasHistory && !dataLoading && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('points.howItWorks.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                {
                  icon: ClipboardCheck,
                  color: 'text-blue-500',
                  bg: 'bg-blue-500/10',
                  titleKey: 'points.howItWorks.step1title',
                  textKey: 'points.howItWorks.step1text',
                  step: '1',
                },
                {
                  icon: Gift,
                  color: 'text-green-500',
                  bg: 'bg-green-500/10',
                  titleKey: 'points.howItWorks.step2title',
                  textKey: 'points.howItWorks.step2text',
                  step: '2',
                },
                {
                  icon: BarChart3,
                  color: 'text-primary',
                  bg: 'bg-primary/10',
                  titleKey: 'points.howItWorks.step3title',
                  textKey: 'points.howItWorks.step3text',
                  step: '3',
                },
              ].map(({ icon: Icon, color, bg, titleKey, textKey, step }) => (
                <div key={step} className="flex gap-3 sm:flex-col sm:items-center sm:text-center">
                  <div
                    className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${bg} sm:size-12`}
                  >
                    <Icon className={`size-5 ${color} sm:size-6`} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold sm:mt-2">{t(titleKey)}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">{t(textKey)}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </>
  )
}
