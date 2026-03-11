import { useTranslation } from 'react-i18next'
import { Download, XCircle, MoreHorizontal } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

interface SurveyRow {
  surveyId: number
  points: number
  maxClaims: number
  claimCount: number
  active: boolean
  registeredAt: string
}

interface SurveyTableProps {
  surveys: SurveyRow[]
  onDownloadTemplate: (surveyId: number) => void
  onDeactivate: (surveyId: number) => void
}

function getStatus(survey: SurveyRow): 'active' | 'inactive' | 'nearLimit' {
  if (!survey.active) return 'inactive'
  if (survey.claimCount >= survey.maxClaims * 0.8) return 'nearLimit'
  return 'active'
}

const statusVariant: Record<string, string> = {
  active: 'bg-success/10 text-success border-success/20',
  inactive: 'bg-destructive/10 text-destructive border-destructive/20',
  nearLimit: 'bg-warning/10 text-warning border-warning/20',
}

export function SurveyTable({ surveys, onDownloadTemplate, onDeactivate }: SurveyTableProps) {
  const { t } = useTranslation()

  if (surveys.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">{t('common.noResults')}</p>
    )
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden overflow-x-auto md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('admin.surveys.table.id')}</TableHead>
              <TableHead className="text-right">{t('admin.surveys.table.points')}</TableHead>
              <TableHead className="text-right">{t('admin.surveys.table.claims')}</TableHead>
              <TableHead>{t('admin.surveys.table.status')}</TableHead>
              <TableHead>{t('admin.surveys.table.created')}</TableHead>
              <TableHead className="text-right">{t('admin.surveys.table.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {surveys.map((survey) => {
              const status = getStatus(survey)
              return (
                <TableRow key={survey.surveyId}>
                  <TableCell className="font-medium">{survey.surveyId}</TableCell>
                  <TableCell className="text-right">{survey.points}</TableCell>
                  <TableCell className="text-right">
                    {survey.claimCount} / {survey.maxClaims}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn('border', statusVariant[status])}>
                      {t(`admin.surveys.status.${status}`)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(survey.registeredAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8">
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onDownloadTemplate(survey.surveyId)}>
                          <Download className="mr-2 size-4" />
                          {t('admin.surveys.downloadTemplate')}
                        </DropdownMenuItem>
                        {survey.active && (
                          <DropdownMenuItem
                            onClick={() => onDeactivate(survey.surveyId)}
                            className="text-destructive"
                          >
                            <XCircle className="mr-2 size-4" />
                            {t('admin.surveys.deactivate')}
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {/* Mobile card list */}
      <div className="space-y-3 md:hidden">
        {surveys.map((survey) => {
          const status = getStatus(survey)
          return (
            <div key={survey.surveyId} className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-medium">#{survey.surveyId}</span>
                <Badge variant="outline" className={cn('border', statusVariant[status])}>
                  {t(`admin.surveys.status.${status}`)}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-muted-foreground">{t('admin.surveys.table.points')}</p>
                  <p className="font-medium">{survey.points}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t('admin.surveys.table.claims')}</p>
                  <p className="font-medium">
                    {survey.claimCount} / {survey.maxClaims}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onDownloadTemplate(survey.surveyId)}
                  className="flex-1"
                >
                  <Download className="mr-1 size-3" />
                  Template
                </Button>
                {survey.active && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onDeactivate(survey.surveyId)}
                    className="text-destructive"
                  >
                    <XCircle className="mr-1 size-3" />
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
