import { useTranslation } from 'react-i18next'
import { BarChart3, CheckCircle2, Award, Activity } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

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
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {metrics.map(({ label, value, icon: Icon, color, bgColor }) => (
        <Card key={label}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
            <div className={`rounded-md p-2 ${bgColor}`}>
              <Icon className={`size-4 ${color}`} />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{value.toLocaleString()}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
