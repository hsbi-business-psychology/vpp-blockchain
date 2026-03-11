import { useTranslation } from 'react-i18next'
import { BarChart3, CheckCircle2, Award, Activity } from 'lucide-react'

interface MetricsCardsProps {
  totalSurveys: number
  activeSurveys: number
  totalClaims: number
  totalPoints: number
}

export function MetricsCards({ totalSurveys, activeSurveys, totalClaims, totalPoints }: MetricsCardsProps) {
  const { t } = useTranslation()

  const metrics = [
    {
      label: t('admin.metrics.totalSurveys'),
      value: totalSurveys,
      icon: BarChart3,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
    },
    {
      label: t('admin.metrics.activeSurveys'),
      value: activeSurveys,
      icon: Activity,
      color: 'text-success',
      bgColor: 'bg-success/10',
    },
    {
      label: t('admin.metrics.totalClaims'),
      value: totalClaims,
      icon: CheckCircle2,
      color: 'text-chart-3',
      bgColor: 'bg-chart-3/10',
    },
    {
      label: t('admin.metrics.totalPoints'),
      value: totalPoints,
      icon: Award,
      color: 'text-warning',
      bgColor: 'bg-warning/10',
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {metrics.map(({ label, value, icon: Icon, color, bgColor }) => (
        <div
          key={label}
          className="flex items-center gap-3 rounded-lg border border-border bg-card p-3"
        >
          <div className={`flex size-9 shrink-0 items-center justify-center rounded-md ${bgColor}`}>
            <Icon className={`size-4 ${color}`} />
          </div>
          <div className="min-w-0">
            <p className="text-2xl font-bold leading-none">{value.toLocaleString()}</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{label}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
