import { useTranslation } from 'react-i18next'
import { Download, XCircle, MoreHorizontal, ChevronRight } from 'lucide-react'
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
  title: string
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
  onSelect?: (surveyId: number) => void
}

const statusVariant: Record<string, string> = {
  active: 'bg-success/10 text-success border-success/20',
  inactive: 'bg-destructive/10 text-destructive border-destructive/20',
}

export function SurveyTable({ surveys, onDownloadTemplate, onDeactivate, onSelect }: SurveyTableProps) {
  const { t } = useTranslation()

  if (surveys.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">{t('common.noResults')}</p>
    )
  }

  const getStatus = (s: SurveyRow) => (s.active ? 'active' : 'inactive')

  return (
    <>
      {/* Desktop table */}
      <div className="hidden overflow-x-auto md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>{t('admin.register.surveyTitle')}</TableHead>
              <TableHead className="text-right">{t('admin.surveys.table.points')}</TableHead>
              <TableHead className="text-right">{t('admin.surveys.table.claims')}</TableHead>
              <TableHead>{t('admin.surveys.table.status')}</TableHead>
              <TableHead>{t('admin.surveys.table.created')}</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {surveys.map((survey) => {
              const status = getStatus(survey)
              return (
                <TableRow
                  key={survey.surveyId}
                  className={cn(onSelect && 'cursor-pointer hover:bg-muted/50')}
                  onClick={() => onSelect?.(survey.surveyId)}
                >
                  <TableCell className="font-mono text-muted-foreground">{survey.surveyId}</TableCell>
                  <TableCell className="font-medium">
                    {survey.title || `Survey #${survey.surveyId}`}
                  </TableCell>
                  <TableCell className="text-right">{survey.points}</TableCell>
                  <TableCell className="text-right">{survey.claimCount}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn('border', statusVariant[status])}>
                      {t(`admin.surveys.status.${status}`)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(survey.registeredAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={(e) => e.stopPropagation()}
                        >
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
            <div
              key={survey.surveyId}
              className={cn(
                'rounded-lg border p-4 space-y-3',
                onSelect && 'cursor-pointer hover:bg-muted/50',
              )}
              onClick={() => onSelect?.(survey.surveyId)}
            >
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">
                    {survey.title || `Survey #${survey.surveyId}`}
                  </p>
                  <p className="text-xs text-muted-foreground">ID: {survey.surveyId}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={cn('border', statusVariant[status])}>
                    {t(`admin.surveys.status.${status}`)}
                  </Badge>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div>
                  <p className="text-muted-foreground">{t('admin.surveys.table.points')}</p>
                  <p className="font-medium">{survey.points}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t('admin.surveys.table.claims')}</p>
                  <p className="font-medium">{survey.claimCount}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t('admin.surveys.table.created')}</p>
                  <p className="font-medium">{new Date(survey.registeredAt).toLocaleDateString()}</p>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
